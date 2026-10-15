// The rules behind Temp Check: reducing words to something comparable, scoring, the
// schedule of rounds, and asking the model for its words. server/game.js runs the game
// with these.
import fs from "node:fs/promises";
import path from "node:path";
import { PROMPTS } from "./prompts.js";
import { chat } from "./ollama.js";
import { config, publicDir } from "./config.js";

// ---------- words ----------
// Words are always compared whole, never as tokens.

// Reduces a model reply or a player's entry to a single comparable word.
export function normalizeWord(text) {
  const first = String(text ?? "")
    .toLowerCase()
    .trim()
    .split(/\s+/)[0];
  // Drop punctuation at either end but keep inner apostrophes and hyphens.
  return first.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

// Counts words and returns [word, count] pairs, most common first.
export function tally(words) {
  const counts = new Map();
  for (const word of words) {
    if (word) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// Single English words rarely run past this, while glued-together junk often does.
const MAX_MACHINE_WORD_LENGTH = 15;

// Plain English letters, with single hyphens or apostrophes inside.
const WORD_SHAPE = /^[a-z]+(?:['’-][a-z]+)*$/;

// Does this look like a real word? At high temperature the model sometimes glues
// stray tokens onto a word ("jelly;margin", "bookปก", "jelly_evaluate"). This catches
// digits, symbols, other alphabets, stutters ("guuu") and very long strings. It can't
// catch every invented word, and doesn't try to.
export function looksLikeWord(word) {
  return (
    word.length <= MAX_MACHINE_WORD_LENGTH &&
    WORD_SHAPE.test(word) &&
    !/(.)\1\1/.test(word)
  );
}

// ---------- scoring ----------
// Words must already be normalized.

// "Be the machine": the share of the machine's samples that match your word, as a
// whole number from 0 to 100.
export function scoreMatch(word, samples) {
  if (!word || samples.length === 0) return 0;
  const matches = samples.filter((sample) => sample === word).length;
  return Math.round((matches / samples.length) * 100);
}

// "Beat the machine": 100 if neither the machine nor any other player said your word,
// otherwise 0. `playerWords` holds every player's word, including yours.
export function scoreBeat(word, samples, playerWords) {
  return beatOutcome(word, samples, playerWords) === "unique" ? 100 : 0;
}

// Why a Beat answer did or didn't score: "none" (no answer), "machine", "player"
// (someone else said it) or "unique".
export function beatOutcome(word, samples, playerWords) {
  if (!word) return "none";
  if (samples.includes(word)) return "machine";
  const sameWord = playerWords.filter((other) => other === word).length;
  return sameWord > 1 ? "player" : "unique";
}

// Hot/Cold taps in the finale. Each player's level runs from -5 (coldest) to +5
// (hottest), and the average maps to a temperature: -5 -> 0, 0 -> `middle`, +5 -> `max`.
export const VOTE_RANGE = 5;

export function temperatureFromVotes(levels, { middle = 0.7, max = 1.5 } = {}) {
  if (levels.length === 0) return middle;
  const average = levels.reduce((sum, level) => sum + level, 0) / levels.length;
  const share = Math.max(-1, Math.min(1, average / VOTE_RANGE));
  const temperature =
    share >= 0 ? middle + share * (max - middle) : middle + share * middle;
  return Math.round(temperature * 10) / 10;
}

// ---------- schedule ----------
// The rounds (public/data/rounds.json) and sentence stems (public/data/stems.json).
// Both are read each time a game starts, so edits apply without a restart.

const dataDir = path.join(publicDir, "data");

async function readJson(name) {
  try {
    return JSON.parse(await fs.readFile(path.join(dataDir, name), "utf8"));
  } catch (error) {
    throw new Error(`Couldn't read data/${name}: ${error.message}`);
  }
}

export function validateSchedule(schedule, stems) {
  if (!Array.isArray(schedule.rounds) || schedule.rounds.length === 0) {
    throw new Error('rounds.json needs a non-empty "rounds" list.');
  }
  schedule.rounds.forEach((round, index) => {
    const label = `Round ${index + 1}`;
    if (round.mode !== "match" && round.mode !== "beat") {
      throw new Error(`${label}: mode must be "match" or "beat".`);
    }
    if (!Array.isArray(stems[round.pool]) || stems[round.pool].length === 0) {
      throw new Error(`${label}: stems.json has no stems for pool "${round.pool}".`);
    }
    const hasTemperature = typeof round.temperature === "number";
    if (!hasTemperature && !round.crowd) {
      throw new Error(`${label}: needs a temperature, or "crowd": true.`);
    }
  });
}

export async function loadSchedule() {
  const [schedule, stems] = await Promise.all([
    readJson("rounds.json"),
    readJson("stems.json"),
  ]);
  validateSchedule(schedule, stems);
  return {
    inputSeconds: schedule.inputSeconds ?? 10,
    sampleCount: schedule.sampleCount ?? 20,
    leaderboardEvery: schedule.leaderboardEvery ?? 3,
    maxTemperature: schedule.maxTemperature ?? 1.5,
    rounds: schedule.rounds,
    stems,
  };
}

// ---------- sampling ----------

const SAMPLING_TIMEOUT_MS = 20000;

// Asks the model for the same one-word completion many times at once, so the room can
// see how temperature spreads the answers. Failed requests and garbled replies are
// dropped, so `words.length` may be less than `count`; `garbled` says how many replies
// were thrown out for being garbled.
export async function sampleWords({ stem, temperature, count = 20, signal }) {
  const { system, options } = PROMPTS.temp.sample;
  const deadline = AbortSignal.timeout(SAMPLING_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;

  const results = await Promise.allSettled(
    Array.from({ length: count }, () =>
      chat({
        model: config.tempModel,
        system,
        user: stem,
        options: { ...options, temperature },
        signal: combined,
      })
    )
  );

  const replies = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => normalizeWord(result.value.text))
    .filter(Boolean);

  const words = replies.filter(looksLikeWord);
  return { words, requested: count, garbled: replies.length - words.length };
}
