// The Temp Check game: one shared game for the whole room, held in memory.
//
// Phases:  lobby -> intro -> input -> reveal -> (leaderboard) -> intro ... -> ended
//
//   lobby        waiting for people to join
//   intro        the stem and temperature are shown; the host reads it out
//   input        everyone types one word; the machine is sampled at the same time
//   reveal       the machine's words and everyone's scores
//   leaderboard  top players, every few rounds
//   ended        final standings
//
// The host drives the phases. Players only answer (and, in the finale, vote).
import { InputError } from "./errors.js";
import { normaliseWord, tally } from "./words.js";
import { scoreMatch, beatOutcome, temperatureFromVotes, VOTE_RANGE } from "./scoring.js";

const MAX_WORD_LENGTH = 30;
const LEADERBOARD_SIZE = 8;
const REVEAL_WORD_LIMIT = 10;
// Answers that arrive just after the countdown reaches zero still count.
const ANSWER_GRACE_MS = 800;
const MAX_TEMPERATURE = 2;

const clampTemperature = (value) =>
  Math.round(Math.max(0, Math.min(MAX_TEMPERATURE, value)) * 10) / 10;

export class Game {
  // loadSchedule() returns the rounds and stems; sampler() asks the model for
  // the machine's words; getName(id) returns a player's display name.
  constructor({ loadSchedule, sampler, getName }) {
    this.loadSchedule = loadSchedule;
    this.sampler = sampler;
    this.getName = getName;
    this.listeners = new Set();
    this.players = new Map(); // id -> { connections }
    this.timer = null;
    this.emitTimer = null;
    this.clearGame();
  }

  // ---------- setup ----------

  clearGame() {
    this.schedule = null;
    this.phase = "lobby";
    this.round = null;
    this.endsAt = 0;
    this.answers = new Map(); // id -> word
    this.votes = new Map(); // id -> level from -5 (cold) to +5 (hot)
    this.sampling = null;
    this.results = null;
    this.history = []; // finished rounds: { index, points: Map(id -> points) }
    this.usedStems = new Set();
  }

  async ensureSchedule() {
    if (!this.schedule) this.schedule = await this.loadSchedule();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    for (const listener of this.listeners) listener();
  }

  // Coalesces bursts (such as many Hot/Cold taps) into one update.
  emitSoon() {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      this.emit();
    }, 200);
  }

  // ---------- players ----------

  connect(id) {
    const player = this.players.get(id) ?? { connections: 0 };
    player.connections++;
    this.players.set(id, player);
    this.emit();
  }

  disconnect(id) {
    const player = this.players.get(id);
    if (!player) return;
    player.connections = Math.max(0, player.connections - 1);
    this.emit();
  }

  // Records a player's word for the current round. The last word before the
  // input phase ends is the one that counts. Returns the normalised word.
  answer(id, text) {
    if (this.phase !== "input") throw new InputError("Time's up.", 409);
    const word = normaliseWord(text);
    if (!word) throw new InputError("Type a word.");
    if (word.length > MAX_WORD_LENGTH) throw new InputError("That word is too long.");

    if (!this.players.has(id)) this.players.set(id, { connections: 0 });
    this.answers.set(id, word);
    this.emitSoon();
    return word;
  }

  // Finale only: each tap nudges this player's Hot/Cold level, and the average
  // of everyone's levels sets the temperature.
  vote(id, direction) {
    if (this.phase !== "intro" || !this.round?.crowd) {
      throw new InputError("Voting isn't open.", 409);
    }
    if (direction !== "hot" && direction !== "cold") {
      throw new InputError('direction must be "hot" or "cold".');
    }
    if (!this.players.has(id)) this.players.set(id, { connections: 0 });

    const level = (this.votes.get(id) ?? 0) + (direction === "hot" ? 1 : -1);
    this.votes.set(id, Math.max(-VOTE_RANGE, Math.min(VOTE_RANGE, level)));
    this.round.temperature = this.crowdTemperature();
    this.emitSoon();
  }

  // Only people who have voted count towards the average.
  crowdTemperature() {
    return temperatureFromVotes([...this.votes.values()], {
      max: this.schedule.maxTemperature,
    });
  }

  // ---------- host commands ----------

  async command({ action, delta, value } = {}) {
    await this.ensureSchedule();
    switch (action) {
      case "next":
        return this.next();
      case "redo":
        return this.redo();
      case "reset":
        return this.reset();
      case "temperature":
        return this.adjustTemperature({ delta, value });
      default:
        throw new InputError("Unknown command.");
    }
  }

  next() {
    switch (this.phase) {
      case "lobby":
        return this.startRound(0);
      case "intro":
        return this.startInput();
      case "input":
        return this.endInput();
      case "reveal":
        if (!this.results) return; // the machine is still thinking
        if (this.isLastRound()) return this.finish();
        if (this.leaderboardDue()) return this.showLeaderboard();
        return this.startRound(this.round.index + 1);
      case "leaderboard":
        return this.startRound(this.round.index + 1);
      default:
        return undefined;
    }
  }

  isLastRound() {
    return this.round.index >= this.schedule.rounds.length - 1;
  }

  leaderboardDue() {
    return (this.round.index + 1) % this.schedule.leaderboardEvery === 0;
  }

  // People who have left the room are dropped when a game starts, so they don't
  // linger in the standings.
  pruneAbsent() {
    for (const [id, player] of this.players) {
      if (player.connections === 0) this.players.delete(id);
    }
  }

  startRound(index) {
    if (index === 0) this.pruneAbsent();
    this.cancelRound();
    this.votes = new Map();
    const entry = this.schedule.rounds[index];
    this.round = {
      index,
      total: this.schedule.rounds.length,
      mode: entry.mode,
      crowd: Boolean(entry.crowd),
      stem: this.pickStem(entry.pool),
      temperature: entry.crowd ? this.crowdTemperature() : entry.temperature,
    };
    this.phase = "intro";
    this.emit();
  }

  pickStem(pool) {
    const all = this.schedule.stems[pool];
    const unused = all.filter((stem) => !this.usedStems.has(stem));
    const choices = unused.length > 0 ? unused : all;
    const stem = choices[Math.floor(Math.random() * choices.length)];
    this.usedStems.add(stem);
    return stem;
  }

  // Stops anything running for the current round and clears its answers.
  cancelRound() {
    clearTimeout(this.timer);
    this.timer = null;
    this.sampling?.controller.abort();
    this.sampling = null;
    this.answers = new Map();
    this.results = null;
    this.endsAt = 0;
  }

  // The machine is asked for its words now, while people are still typing,
  // so the reveal doesn't have to wait.
  startInput() {
    const { stem, temperature } = this.round;
    const controller = new AbortController();
    const count = this.schedule.sampleCount;
    const promise = this.sampler({
      stem,
      temperature,
      count,
      signal: controller.signal,
    }).catch(() => ({ words: [], requested: count }));
    this.sampling = { controller, promise };

    const duration = this.schedule.inputSeconds * 1000;
    this.phase = "input";
    this.endsAt = Date.now() + duration;
    this.timer = setTimeout(() => this.endInput(), duration + ANSWER_GRACE_MS);
    this.emit();
  }

  async endInput() {
    if (this.phase !== "input") return;
    clearTimeout(this.timer);
    this.timer = null;
    this.phase = "reveal";
    this.results = null;
    this.emit();

    const sampling = this.sampling;
    const sample = await sampling.promise;
    // The host may have redone the round while we waited.
    if (this.sampling !== sampling || this.phase !== "reveal") return;

    this.results = this.computeResults(sample);
    this.history.push({
      index: this.round.index,
      points: new Map(this.results.rows.map((row) => [row.id, row.points])),
    });
    this.emit();
  }

  computeResults(sample) {
    const ids = [...this.players.keys()];
    const playerWords = ids.map((id) => this.answers.get(id)).filter(Boolean);

    // If the machine didn't answer at all, the round is void: nobody scores,
    // rather than everyone "beating" an empty list.
    const machineSilent = sample.words.length === 0;

    const rows = ids.map((id) => {
      const word = this.answers.get(id) ?? "";
      if (machineSilent) return { id, word, points: 0 };
      if (this.round.mode === "match") {
        return { id, word, points: scoreMatch(word, sample.words) };
      }
      const outcome = beatOutcome(word, sample.words, playerWords);
      return { id, word, outcome, points: outcome === "unique" ? 100 : 0 };
    });

    return {
      counts: tally(sample.words),
      received: sample.words.length,
      requested: sample.requested,
      garbled: sample.garbled ?? 0,
      playerWords: tally(playerWords),
      rows,
    };
  }

  showLeaderboard() {
    this.phase = "leaderboard";
    this.emit();
  }

  finish() {
    this.phase = "ended";
    this.emit();
  }

  // Runs the current round again with the same stem and temperature.
  redo() {
    if (!this.round || this.phase === "lobby" || this.phase === "intro") return;
    this.history = this.history.filter((entry) => entry.index !== this.round.index);
    this.cancelRound();
    this.phase = "intro";
    this.emit();
  }

  reset() {
    this.cancelRound();
    this.clearGame();
    this.pruneAbsent();
    this.emit();
    return this.ensureSchedule();
  }

  adjustTemperature({ delta, value }) {
    if (this.phase !== "intro") return;
    const next =
      typeof value === "number" ? value : this.round.temperature + (delta ?? 0);
    if (!Number.isFinite(next)) throw new InputError("Invalid temperature.");
    this.round.temperature = clampTemperature(next);
    this.emit();
  }

  // ---------- standings ----------

  totals() {
    const totals = new Map();
    for (const entry of this.history) {
      for (const [id, points] of entry.points) {
        totals.set(id, (totals.get(id) ?? 0) + points);
      }
    }
    return totals;
  }

  // Everyone, best first. Players on the same score share a rank.
  standings() {
    const totals = this.totals();
    const rows = [...this.players.keys()].map((id) => ({
      id,
      name: this.getName(id),
      total: totals.get(id) ?? 0,
    }));
    rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    for (const row of rows) {
      row.rank = 1 + rows.filter((other) => other.total > row.total).length;
    }
    return rows;
  }

  // ---------- views ----------
  // Views only ever contain names and scores, never pronouns.

  connectedCount() {
    return [...this.players.values()].filter((player) => player.connections > 0).length;
  }

  publicRound() {
    if (!this.round) return null;
    const { index, total, mode, crowd, stem, temperature } = this.round;
    return { index, total, mode, crowd, stem, temperature };
  }

  // The machine's words and the round's scores, once the reveal is ready.
  publicResults() {
    if (!this.results) return null;
    const { counts, received, requested, garbled, playerWords, rows } = this.results;
    const machineCounts = new Map(counts);
    const top = counts.slice(0, REVEAL_WORD_LIMIT);

    return {
      received,
      requested,
      garbled,
      machine: top.map(([word, count]) => ({ word, count })),
      machineOther: counts.slice(REVEAL_WORD_LIMIT).reduce((sum, [, n]) => sum + n, 0),
      players: playerWords.map(([word, count]) => {
        const machineCount = machineCounts.get(word) ?? 0;
        // In Beat rounds a word only scores if neither the machine nor another
        // player said it.
        let status = null;
        if (this.round.mode === "beat") {
          status = machineCount > 0 ? "machine" : count > 1 ? "player" : "unique";
        }
        return { word, count, machineCount, status };
      }),
      points: [...rows]
        .sort((a, b) => b.points - a.points)
        .filter((row) => row.points > 0)
        .slice(0, LEADERBOARD_SIZE)
        .map((row) => ({
          name: this.getName(row.id),
          word: row.word,
          points: row.points,
        })),
    };
  }

  baseView() {
    return {
      phase: this.phase,
      now: Date.now(),
      endsAt: this.endsAt,
      inputSeconds: this.schedule?.inputSeconds ?? 10,
      round: this.publicRound(),
      thinking: this.phase === "reveal" && !this.results,
      results: this.phase === "reveal" ? this.publicResults() : null,
    };
  }

  hostView() {
    const showStandings = this.phase === "leaderboard" || this.phase === "ended";
    return {
      ...this.baseView(),
      playersConnected: this.connectedCount(),
      playersJoined: this.players.size,
      names: this.phase === "lobby" ? this.connectedNames() : [],
      answersIn: this.answers.size,
      voters: this.votes.size,
      leaderboard: showStandings
        ? this.standings()
            .slice(0, LEADERBOARD_SIZE)
            .map(({ name, total, rank }) => ({ name, total, rank }))
        : null,
    };
  }

  connectedNames() {
    return [...this.players.entries()]
      .filter(([, player]) => player.connections > 0)
      .map(([id]) => this.getName(id))
      .sort((a, b) => a.localeCompare(b));
  }

  playerView(id) {
    const standing = this.standings().find((row) => row.id === id);
    const row = this.results?.rows.find((entry) => entry.id === id);
    const showStandings = this.phase === "leaderboard" || this.phase === "ended";

    return {
      ...this.baseView(),
      you: {
        name: this.getName(id),
        answer: this.answers.get(id) ?? null,
        level: this.votes.get(id) ?? 0,
        total: standing?.total ?? 0,
        rank: standing?.rank ?? null,
        // Present once the round has been scored.
        result: row
          ? { word: row.word, points: row.points, outcome: row.outcome ?? null }
          : null,
      },
      playerCount: this.players.size,
      playersConnected: this.connectedCount(),
      leaderboard: showStandings
        ? this.standings()
            .slice(0, LEADERBOARD_SIZE)
            .map((row) => ({
              name: row.name,
              total: row.total,
              rank: row.rank,
              you: row.id === id,
            }))
        : null,
    };
  }

  // What the "peek" panel needs besides the fixed prompt.
  liveSampling() {
    return { temperature: this.round?.temperature ?? null };
  }
}
