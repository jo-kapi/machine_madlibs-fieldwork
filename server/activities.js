// One function per activity: build the request, call the model, clean the reply.
// Replies are parsed here so the browser only ever receives tidy data.
import fs from "node:fs/promises";
import path from "node:path";
import { PROMPTS, CRAZINESS } from "./prompts.js";
import { chat, OllamaError } from "./ollama.js";
import { InputError } from "./web.js";
import { publicDir } from "./config.js";

const MAX_STORY_PARTS = 100;
const MAX_STORY_CHARS = 4000;
const MAX_SHORT_INPUT = 100;

// Wild cards live in public/data/wildcards.json: an id and five words or phrases each.
// The file is read on every use, so edits apply immediately.
const CARDS_FILE = path.join(publicDir, "data", "wildcards.json");

export async function findCard(id) {
  try {
    const cards = JSON.parse(await fs.readFile(CARDS_FILE, "utf8"));
    return cards.find((card) => card.id === id) ?? null;
  } catch {
    return null;
  }
}

function shortText(value, label) {
  if (typeof value !== "string") throw new InputError(`${label} must be text.`);
  const text = value.trim();
  if (text.length > MAX_SHORT_INPUT) {
    throw new InputError(`${label} is too long (max ${MAX_SHORT_INPUT} characters).`);
  }
  return text;
}

// The slider's position, from 0 to 1. Pages without a slider send nothing, which means
// the middle.
export function parseCraziness(value) {
  if (value === undefined || value === null) return CRAZINESS.default;
  if (typeof value !== "number" || !(value >= 0 && value <= 1)) {
    throw new InputError("craziness must be a number from 0 to 1.");
  }
  return value;
}

// Returns the prompt's sampling options as the slider changes them (see CRAZINESS).
export function withCraziness(options, craziness = CRAZINESS.default) {
  if (options.temperature === undefined) return options;
  const { cooler, hotter, minTemperature, maxTemperature, topP, topK } = CRAZINESS;
  const away = (craziness - CRAZINESS.default) * 2; // -1 (steady) to 1 (wild)

  const moved = options.temperature + (away < 0 ? away * cooler : away * hotter);
  const temperature = Math.min(maxTemperature, Math.max(minTemperature, moved));
  const result = { ...options, temperature: round(temperature, 2) };

  if (away > 0) {
    result.top_p = round(topP.from + away * (topP.to - topP.from), 2);
    result.top_k = Math.round(topK.from + away * (topK.to - topK.from));
  }
  return result;
}

const round = (number, places) => Math.round(number * 10 ** places) / 10 ** places;

// Keeps the first sentence-sized chunk and drops a trailing fragment that was
// cut off by the token limit.
export function tidySentence(text) {
  let clean = text
    .replace(/\s+/g, " ")
    // Models sometimes add markdown emphasis (**word**, _word_), which would show
    // up as stray symbols in the story.
    .replace(/\*+/g, "")
    .replace(/(^|\s)_+([^_]+?)_+(?=[\s.,;:!?]|$)/g, "$1$2")
    .replace(/^(AI|You):\s*/i, "")
    .trim();
  clean = clean.replace(/^["“](.*)["”]$/, "$1");
  if (/[.!?…。！？؟।]["”')」』]?$/.test(clean)) return clean;
  const lastEnd = Math.max(
    clean.lastIndexOf(". "),
    clean.lastIndexOf("! "),
    clean.lastIndexOf("? "),
    // Full stops of other scripts are not followed by a space.
    ...[..."。！？؟।"].map((mark) => clean.lastIndexOf(mark))
  );
  return lastEnd > 0 ? clean.slice(0, lastEnd + 1) : clean;
}

// Commas as other languages write them: full-width, ideographic and Arabic.
const COMMAS = /[,，、،]/;

// Models sometimes wrap the list in chatter such as "Here is your list:". Text
// before a colon is dropped, and when some lines are comma-separated lists the
// lines without commas are treated as chatter too.
export function parseWords(text, max = Infinity) {
  const lines = text
    .split("\n")
    .map((line) =>
      line.slice(Math.max(line.lastIndexOf(":"), line.lastIndexOf("：")) + 1)
    )
    .filter((line) => line.trim());
  const hasList = lines.some((line) => COMMAS.test(line));
  const source = (hasList ? lines.filter((line) => COMMAS.test(line)) : lines).join(",");
  const words = source
    .toLowerCase()
    .split(COMMAS)
    .map((word) =>
      word
        // Letters, plus the marks that vowels and accents are written with in many
        // scripts (Hindi, Tamil, Arabic) and the joiners between letters.
        .replace(/[^\p{L}\p{M}\u200c\u200d\s'-]/gu, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean);
  return [...new Set(words)].slice(0, max);
}

export function parseHex(text) {
  const clean = text.trim().toLowerCase();
  const match = clean.match(/#?([a-f0-9]{6}|[a-f0-9]{3})\b/);
  if (!match) return null;
  let digits = match[1];
  if (digits.length === 3) digits = [...digits].map((d) => d + d).join("");
  return `#${digits}`;
}

// Picks one of the length instructions at random and adds it to the system prompt.
export function withLength(system, lengths, random = Math.random) {
  return `${system} ${lengths[Math.floor(random() * lengths.length)]}`;
}

// Lowercases and straightens curly apostrophes, so "witch’s" matches "witch's".
const plain = (text) => text.toLowerCase().replace(/[\u2018\u2019]/g, "'");

// The words on a wild card that the machine may choose from: the ones the writer
// did not use in their own sentence, so the two of them don't pick the same one.
export function cardChoices(words, humanSentence) {
  const sentence = plain(String(humanSentence ?? ""));
  return words.filter((word) => !sentence.includes(plain(word)));
}

// The story so far as a conversation. The last sentence is the writer's, the one before
// it the machine's, and so on back. Sent as one block of text the machine often carried
// on with its own idea; sent this way it can tell its sentences from the writer's and
// answers the latest one.
export function storyMessages(story) {
  const parts = story.map((part) => part.trim()).filter(Boolean);
  const messages = parts.map((content, index) => ({
    role: (parts.length - 1 - index) % 2 === 0 ? "user" : "assistant",
    content,
  }));
  // A conversation starts with the user, and the machine's opening line is its answer.
  if (messages[0]?.role === "assistant") {
    messages.unshift({ role: "user", content: "Begin a new story." });
  }
  return messages;
}

// `story` is the sentences so far, alternating between the AI and the human.
// `cardId` names a wild card. The machine works one of its words into its next
// sentence, a different one from the writer's, and doesn't mention the card.
export async function writer({ mode, story = [], cardId, craziness, signal }) {
  const slider = parseCraziness(craziness);

  if (mode === "start") {
    const { system, lengths, options } = PROMPTS.writer.start;
    const { text } = await chat({
      system: withLength(system, lengths),
      user: "Begin a new story.",
      options: withCraziness(options, slider),
      signal,
    });
    return { text: tidySentence(text) };
  }

  if (mode !== "continue") throw new InputError('mode must be "start" or "continue".');
  if (!Array.isArray(story) || story.length === 0 || story.length > MAX_STORY_PARTS) {
    throw new InputError("story must be a list of sentences.");
  }
  if (story.some((part) => typeof part !== "string")) {
    throw new InputError("story must be a list of sentences.");
  }
  const messages = storyMessages(story);
  const totalLength = messages.reduce((sum, message) => sum + message.content.length, 0);
  if (messages.length === 0 || totalLength > MAX_STORY_CHARS) {
    throw new InputError("The story is empty or too long.");
  }

  // The twist and the reminder go on the end of the writer's latest sentence.
  const { system, lengths, options, twist, reminder } = PROMPTS.writer.continue;
  const latest = messages.at(-1);
  if (cardId !== undefined && cardId !== null) {
    const card = await findCard(cardId);
    if (!card) throw new InputError("Unknown wild card.");
    if (Array.isArray(card.words)) {
      // The last sentence is the writer's, so the machine picks a different word.
      const choices = cardChoices(card.words, story.at(-1));
      if (choices.length > 0) {
        latest.content += `\n\n${twist.replace("{words}", choices.join(", "))}`;
      }
    }
  }
  latest.content += `\n\n${reminder}`;

  const { text } = await chat({
    system: withLength(system, lengths),
    messages,
    options: withCraziness(options, slider),
    signal,
  });
  return { text: tidySentence(text) };
}

// An empty theme asks for filler words (articles and prepositions).
export async function poet({ theme, craziness, signal }) {
  const input = shortText(theme ?? "", "Theme");
  const slider = parseCraziness(craziness);
  const filler = input === "";
  const { system, options } = filler ? PROMPTS.poet.filler : PROMPTS.poet.words;
  const { text } = await chat({
    system,
    user: filler ? "Give me the words." : input,
    options: withCraziness(options, slider),
    signal,
  });
  const words = parseWords(text, filler ? 5 : 8);
  if (words.length === 0) {
    throw new OllamaError("The model didn't return any words. Try again.", 502);
  }
  return { words, filler };
}

export async function color({ description, signal }) {
  const input = shortText(description ?? "", "Color description");
  if (!input) throw new InputError("Describe a color first.");
  const { system, options } = PROMPTS.color.hex;
  const { text } = await chat({ system, user: input, options, signal });
  const hex = parseHex(text);
  if (!hex)
    throw new OllamaError("Couldn't read a color from the reply. Try again.", 502);
  return { hex };
}
