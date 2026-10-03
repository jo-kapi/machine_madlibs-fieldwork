// Reduces a model reply or a player's entry to a single comparable word.
// Words are compared whole, never as tokens.
export function normaliseWord(text) {
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

// Longest word we accept from the machine. Single English words rarely run past
// this, while glued-together junk often does.
const MAX_MACHINE_WORD_LENGTH = 15;

// Plain English letters, with single hyphens or apostrophes inside.
const WORD_SHAPE = /^[a-z]+(?:['\u2019-][a-z]+)*$/;

// Does this look like a real word? At high temperature the machine sometimes
// glues stray tokens onto a word ("jelly;margin", "bookปก", "jelly_evaluate").
// This catches digits, symbols, other alphabets, stutters ("guuu") and very long
// strings. It can't catch every invented word, and doesn't try to.
export function looksLikeWord(word) {
  return (
    word.length <= MAX_MACHINE_WORD_LENGTH &&
    WORD_SHAPE.test(word) &&
    !/(.)\1\1/.test(word)
  );
}
