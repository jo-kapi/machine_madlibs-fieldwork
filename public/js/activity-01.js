// Micro-fiction: you and the machine take turns writing a story, one sentence each.
// The story ends at this many words. This is the one place the limit is set.
const MAX_WORDS = 250;

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
const restartButton = document.querySelector(".restart-btn");

// State
const story = []; // turns so far: { role: "ai" | "human", text, card? (its words), cardId? }
let isBusy = false; // waiting for the machine
let failure = null; // the last failed request, shown with a retry button
let drawnCard = null; // drawn, but not yet used in a sentence
let turnCard = null; // the card that applies to the machine's current turn
let allCards = [];
let deck = []; // cards not yet drawn in this round
let cardsReady = Promise.resolve(); // settles once any saved cards are back
let storyNumber = 0; // goes up with each new story, so late replies to an old one are ignored

function init() {
  // First-time visitors are sent to the join page.
  if (!MM.requireIdentity()) return;
  MM.initInfoPanels();
  Instructions.init("activity-01", { maxWords: MAX_WORDS });

  form.addEventListener("submit", handleSubmit);
  cardButton.addEventListener("click", drawCard);
  cardElement.querySelector(".wildcard__dismiss").addEventListener("click", putCardBack);
  saveButton.addEventListener("click", downloadText);
  restartButton.addEventListener("click", restartStory);

  restoreStory();
  cardsReady = restoreCards();
  // Start a new story, or finish the machine's turn if the page was reloaded
  // while it was still writing (keeping the wild card that went with it).
  const last = story.at(-1);
  if (last?.role === "human" && last.cardId) turnCard = { id: last.cardId };
  if (story.length === 0 || last.role === "human") {
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

  story.push({ role: "human", text, card: drawnCard?.words, cardId: drawnCard?.id });
  turnCard = drawnCard;
  setDrawnCard(null);
  input.value = "";
  requestAiTurn();
}

// Throws the current story away and starts a fresh one.
function restartStory() {
  const hasWriting = story.some((turn) => turn.role === "human");
  const question =
    "Start a new story? The current one will be cleared. Download it first to keep it.";
  if (hasWriting && !confirm(question)) return;

  storyNumber++; // a reply still on its way belongs to the old story
  story.length = 0;
  isBusy = false;
  failure = null;
  turnCard = null;
  putCardBack();
  input.value = "";
  requestAiTurn();
}

// Asks the server for the machine's next sentence (the opening, if the story is empty).
async function requestAiTurn() {
  const thisStory = storyNumber;
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

  let reply = null;
  let problem = null;
  try {
    reply = await MM.api("writer", body);
  } catch (error) {
    problem = error;
  }

  // The writer started a new story while this was thinking: drop the old answer.
  if (thisStory !== storyNumber) return;

  if (reply) {
    story.push({ role: "ai", text: reply.text });
    turnCard = null;
  } else {
    failure = { message: problem.message };
  }
  isBusy = false;
  render();
  if (!input.disabled) input.focus({ preventScroll: true });
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

  // A small note of which words the wild card put into play.
  if (turn.card) {
    const note = document.createElement("span");
    note.className = "story__card";
    note.textContent = `Wild card: ${[].concat(turn.card).join(" · ")}`;
    paragraph.append(note);
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

async function loadCards() {
  if (allCards.length === 0) {
    const response = await fetch("data/wildcards.json");
    allCards = await response.json();
  }
  return allCards;
}

async function drawCard() {
  await cardsReady;
  try {
    await loadCards();
  } catch {
    MM.notice("Couldn't load the wild cards. Try again.", "error");
    return;
  }

  // A card that is already showing goes back to the bottom of the deck.
  if (drawnCard) deck.unshift(drawnCard);
  // Draw without repeats until every card has been seen, then reshuffle.
  if (deck.length === 0) deck = shuffle(allCards);
  setDrawnCard(deck.pop());
}

// Puts the showing card at the bottom of the deck, so it won't come up again soon.
function putCardBack() {
  if (drawnCard) deck.unshift(drawnCard);
  setDrawnCard(null);
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
  saveCards();
  if (!card) return;

  // The card's words, one chip each. Added as text, never as HTML.
  const words = card.words.map((word) => {
    const item = document.createElement("li");
    item.textContent = word;
    return item;
  });
  cardElement.querySelector(".wildcard__words").replaceChildren(...words);
  input.focus();
}

// The card on screen and the rest of the deck survive a reload too, but only in
// this browser tab, like the story.
const CARDS_KEY = "mm-cards";

function saveCards() {
  try {
    const saved = { drawn: drawnCard?.id ?? null, deck: deck.map((card) => card.id) };
    sessionStorage.setItem(CARDS_KEY, JSON.stringify(saved));
  } catch {
    // Storage may be unavailable; cards just won't survive a reload.
  }
}

async function restoreCards() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(CARDS_KEY));
    if (!saved) return;

    // Saved cards are looked up again in the current file, so edits to it are respected.
    const byId = new Map((await loadCards()).map((card) => [card.id, card]));
    deck = (saved.deck ?? []).map((id) => byId.get(id)).filter(Boolean);
    const card = byId.get(saved.drawn);
    if (card) setDrawnCard(card);
  } catch {
    // Nothing usable was saved; the next draw starts a fresh deck.
  }
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
