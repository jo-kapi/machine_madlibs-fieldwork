// Asks the model for the same one-word completion many times at once, so the
// room can see how temperature spreads the answers.
import { PROMPTS } from "./prompts.js";
import { chat } from "./ollama.js";
import { config } from "./config.js";
import { normaliseWord, looksLikeWord } from "./words.js";

const SAMPLING_TIMEOUT_MS = 20000;

// Failed requests and garbled replies are dropped, so `words.length` may be less
// than `count`; `garbled` says how many replies were thrown out for that reason.
// Words are compared whole (never as tokens) after normalising.
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
    .map((result) => normaliseWord(result.value.text))
    .filter(Boolean);

  const words = replies.filter(looksLikeWord);
  return { words, requested: count, garbled: replies.length - words.length };
}
