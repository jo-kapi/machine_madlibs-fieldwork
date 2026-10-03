// One function per activity: build the request, call the model, clean the reply.
// Replies are parsed here so the browser only ever receives tidy data.
import { PROMPTS } from "./prompts.js";
import { chat, OllamaError } from "./ollama.js";
import { InputError } from "./errors.js";
import { findCard } from "./wildcards.js";

const MAX_STORY_PARTS = 100;
const MAX_STORY_CHARS = 4000;
const MAX_SHORT_INPUT = 100;

function shortText(value, label) {
  if (typeof value !== "string") throw new InputError(`${label} must be text.`);
  const text = value.trim();
  if (text.length > MAX_SHORT_INPUT) {
    throw new InputError(`${label} is too long (max ${MAX_SHORT_INPUT} characters).`);
  }
  return text;
}

// Keeps the first sentence-sized chunk and drops a trailing fragment that was
// cut off by the token limit.
export function tidySentence(text) {
  let clean = text
    .replace(/\s+/g, " ")
    .replace(/^(AI|You):\s*/i, "")
    .trim();
  clean = clean.replace(/^["“](.*)["”]$/, "$1");
  if (/[.!?…]["”')]?$/.test(clean)) return clean;
  const lastEnd = Math.max(
    clean.lastIndexOf(". "),
    clean.lastIndexOf("! "),
    clean.lastIndexOf("? ")
  );
  return lastEnd > 0 ? clean.slice(0, lastEnd + 1) : clean;
}

// Models sometimes wrap the list in chatter such as "Here is your list:". Text
// before a colon is dropped, and when some lines are comma-separated lists the
// lines without commas are treated as chatter too.
export function parseWords(text, max = Infinity) {
  const lines = text
    .split("\n")
    .map((line) => line.slice(line.lastIndexOf(":") + 1))
    .filter((line) => line.trim());
  const hasList = lines.some((line) => line.includes(","));
  const source = (hasList ? lines.filter((line) => line.includes(",")) : lines).join(",");
  const words = source
    .toLowerCase()
    .split(",")
    .map((word) =>
      word
        .replace(/[^\p{L}\s'-]/gu, "")
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

// `story` is the sentences so far, alternating between the AI and the human.
// `cardId` names a wild card whose twist applies to the AI's next sentence.
export async function writer({ mode, story = [], cardId, signal }) {
  if (mode === "start") {
    const { system, options } = PROMPTS.writer.start;
    const { text } = await chat({
      system,
      user: "Begin a new story.",
      options,
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
  const joined = story
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  if (!joined || joined.length > MAX_STORY_CHARS) {
    throw new InputError("The story is empty or too long.");
  }

  const { system, options, twist } = PROMPTS.writer.continue;
  let user = joined;
  if (cardId !== undefined && cardId !== null) {
    const card = await findCard(cardId);
    if (!card) throw new InputError("Unknown wild card.");
    if (card.ai) user += `\n\n${twist.replace("{twist}", card.ai)}`;
  }

  const { text } = await chat({ system, user, options, signal });
  return { text: tidySentence(text) };
}

// An empty theme asks for filler words (articles and prepositions).
export async function poet({ theme, signal }) {
  const input = shortText(theme ?? "", "Theme");
  const filler = input === "";
  const { system, options } = filler ? PROMPTS.poet.filler : PROMPTS.poet.words;
  const { text } = await chat({
    system,
    user: filler ? "Give me the words." : input,
    options,
    signal,
  });
  const words = parseWords(text, filler ? 5 : 8);
  if (words.length === 0) {
    throw new OllamaError("The model didn't return any words. Try again.", 502);
  }
  return { words, filler };
}

export async function color({ description, signal }) {
  const input = shortText(description ?? "", "Colour description");
  if (!input) throw new InputError("Describe a colour first.");
  const { system, options } = PROMPTS.color.hex;
  const { text } = await chat({ system, user: input, options, signal });
  const hex = parseHex(text);
  if (!hex)
    throw new OllamaError("Couldn't read a colour from the reply. Try again.", 502);
  return { hex };
}
