// Scoring for Temp Check. Words must already be normalised (see words.js).

// "Be the machine": the share of the machine's samples that match your word.
// Returns a whole number from 0 to 100.
export function scoreMatch(word, samples) {
  if (!word || samples.length === 0) return 0;
  const matches = samples.filter((sample) => sample === word).length;
  return Math.round((matches / samples.length) * 100);
}

// "Beat the machine": 100 if neither the machine nor any other player said your
// word, otherwise 0. `playerWords` holds every player's word, including yours.
export function scoreBeat(word, samples, playerWords) {
  return beatOutcome(word, samples, playerWords) === "unique" ? 100 : 0;
}

// Why a Beat answer did or didn't score: "none" (no answer), "machine",
// "player" (someone else said it) or "unique".
export function beatOutcome(word, samples, playerWords) {
  if (!word) return "none";
  if (samples.includes(word)) return "machine";
  const sameWord = playerWords.filter((other) => other === word).length;
  return sameWord > 1 ? "player" : "unique";
}

// Maps the crowd's Hot/Cold taps to a temperature.
// Each level runs from -5 (coldest) to +5 (hottest). Their average maps linearly:
// -5 -> 0, 0 -> `middle`, +5 -> `max`.
export const VOTE_RANGE = 5;

export function temperatureFromVotes(levels, { middle = 0.7, max = 1.5 } = {}) {
  if (levels.length === 0) return middle;
  const average = levels.reduce((sum, level) => sum + level, 0) / levels.length;
  const share = Math.max(-1, Math.min(1, average / VOTE_RANGE));
  const temperature =
    share >= 0 ? middle + share * (max - middle) : middle + share * middle;
  return Math.round(temperature * 10) / 10;
}
