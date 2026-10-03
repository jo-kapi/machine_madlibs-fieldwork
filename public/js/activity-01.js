// Micro-fiction: you and the machine take turns writing a story, one sentence each.
// The story ends at this many words. This is the one place the limit is set.
const MAX_WORDS = 350;

// DOM elements
const storyElement = document.querySelector(".story");
const scroller = document.querySelector(".text-display");
const form = document.querySelector(".prompt");
const input = form.querySelector("input");
const sendButton = form.querySelector(".prompt__send");
const cardButton = form.querySelector(".prompt__card");
const cardElement = document.querySelector(".wildcard");
const countElement = document.querySelector(".word-count");
const saveButton = document.querySelector(".save-btn");

// State
const story = []; // turns so far: { role: "ai" | "human", text, card? }
let isBusy = false; // waiting for the machine
let failure = null; // the last failed request, shown with a retry button
let drawnCard = null; // drawn, but not yet used in a sentence
let turnCard = null; // the card that applies to the machine's current turn
let allCards = [];
let deck = []; // cards not yet drawn in this round

function init() {
  // Show the limit wherever the page mentions it.
  for (const place of document.querySelectorAll("[data-max-words]")) {
    place.textContent = MAX_WORDS;
  }

  // First-time visitors are sent to the join page.
  if (!MM.requireIdentity()) return;
  MM.initInfoPanels();

  form.addEventListener("submit", handleSubmit);
  cardButton.addEventListener("click", drawCard);
  cardElement
    .querySelector(".wildcard__dismiss")
    .addEventListener("click", () => setDrawnCard(null));
  saveButton.addEventListener("click", downloadText);

  restoreStory();
  // Start a new story, or finish the machine's turn if the page was reloaded
  // while it was still writing.
  if (story.length === 0 || story.at(-1).role === "human") {
    requestAiTurn();
  } else {
    render();
  }
}

// ---------- the story ----------

// The story survives a page reload, but only in this browser tab.
const STORAGE_KEY = "mm-story";

function saveStory() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(story));
  } catch {
    // Storage may be unavailable; the story just won't survive a reload.
  }
}

function restoreStory() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(saved)) return;
    for (const turn of saved) {
      const isValid =
        (turn?.role === "ai" || turn?.role === "human") && typeof turn.text === "string";
      if (isValid) story.push(turn);
    }
  } catch {
    // Nothing usable was saved.
  }
}

function wordCount() {
  return story
    .map((turn) => turn.text)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
}

function handleSubmit(event) {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || isBusy || failure) return;

  story.push({ role: "human", text, card: drawnCard?.title });
  turnCard = drawnCard;
  setDrawnCard(null);
  input.value = "";
  requestAiTurn();
}

// Asks the server for the machine's next sentence (the opening, if the story is empty).
async function requestAiTurn() {
  isBusy = true;
  failure = null;
  render();

  const body =
    story.length === 0
      ? { mode: "start" }
      : {
          mode: "continue",
          story: story.map((turn) => turn.text),
          cardId: turnCard?.id,
        };

  try {
    const { text } = await MM.api("writer", body);
    story.push({ role: "ai", text });
    turnCard = null;
  } catch (error) {
    failure = { message: error.message };
  } finally {
    isBusy = false;
    render();
    if (!input.disabled) input.focus({ preventScroll: true });
  }
}

// ---------- rendering ----------

// Rebuilds the story from state. User text is added as text nodes, never as HTML.
function render() {
  saveStory();
  storyElement.replaceChildren();
  for (const turn of story) storyElement.append(turnElement(turn));

  if (isBusy) {
    const thinking = document.createElement("p");
    thinking.className = "story__turn story__turn--thinking";
    thinking.textContent = "AI is thinking…";
    storyElement.append(thinking);
  }

  if (failure) {
    const error = document.createElement("p");
    error.className = "story__turn story__turn--error";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "Try again";
    retry.addEventListener("click", requestAiTurn);
    error.append(`Error: ${failure.message}`, retry);
    storyElement.append(error);
  }

  // Keep the newest sentence in view, again after layout settles.
  scroller.scrollTop = scroller.scrollHeight;
  requestAnimationFrame(() => {
    scroller.scrollTop = scroller.scrollHeight;
  });
  updateControls();
}

function turnElement(turn) {
  const paragraph = document.createElement("p");
  paragraph.className = `story__turn story__turn--${turn.role}`;

  const role = document.createElement("strong");
  role.textContent = turn.role === "ai" ? "AI:" : "You:";
  paragraph.append(role, " ", turn.text);

  if (turn.card) {
    const tag = document.createElement("span");
    tag.className = "story__card";
    tag.textContent = `Wild card: ${turn.card}`;
    paragraph.append(tag);
  }
  return paragraph;
}

// Shows the word count and locks the form once the story is full.
function updateControls() {
  const words = wordCount();
  const isFull = words >= MAX_WORDS;

  countElement.textContent = `${words} / ${MAX_WORDS} words`;
  input.disabled = isFull;
  input.placeholder = isFull ? "Maximum word count reached" : "";
  sendButton.disabled = isFull || isBusy || Boolean(failure);
  cardButton.disabled = isFull || isBusy;
  form.classList.toggle("prompt--disabled", isFull);
}

// ---------- wild cards ----------

async function drawCard() {
  try {
    if (allCards.length === 0) {
      const response = await fetch("data/wildcards.json");
      allCards = await response.json();
    }
  } catch {
    MM.notice("Couldn't load the wild cards. Try again.", "error");
    return;
  }

  // Draw without repeats until every card has been seen, then reshuffle.
  if (deck.length === 0) deck = shuffle(allCards);
  setDrawnCard(deck.pop());
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function setDrawnCard(card) {
  drawnCard = card;
  cardElement.hidden = !card;
  if (!card) return;

  cardElement.querySelector(".wildcard__title").textContent = card.title;
  cardElement.querySelector(".wildcard__text").textContent = card.human;
  cardElement.querySelector(".wildcard__note").textContent = card.ai
    ? "The machine gets a twist too."
    : "";
  input.focus();
}

// ---------- download ----------

function downloadText() {
  if (story.length === 0) {
    MM.notice("No text to download yet!", "error");
    return;
  }

  const text = story.map((turn) => turn.text).join(" ");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));

  const link = document.createElement("a");
  link.href = url;
  link.download = `machine-madlib-${MM.timestamp()}.txt`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

init();
