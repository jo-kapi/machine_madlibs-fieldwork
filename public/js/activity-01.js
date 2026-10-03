// Micro-fiction: you and the machine take turns writing a story, one sentence each.
// The story ends at this many words. This is the one place the limit is set.
const MAX_WORDS = 250;

// DOM elements
const storyElement = document.querySelector(".story");
const scroller = document.querySelector(".story-scroller");
const form = document.querySelector(".prompt");
const input = form.querySelector("input");
const sendButton = form.querySelector(".prompt__send");
const cardButton = form.querySelector(".prompt__card");
const cardIcon = cardButton.querySelector("svg"); // the asterisk, reused beside a card's words
const cardElement = document.querySelector(".wildcard");
const countElement = document.querySelector(".word-count");
const saveButton = document.querySelector(".toolbar__download");
const restartButton = document.querySelector(".toolbar__restart");

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
  Peek.init();
  Instructions.init("activity-01", { maxWords: MAX_WORDS });

  form.addEventListener("submit", handleSubmit);
  input.addEventListener("input", updateChips);
  cardButton.addEventListener("click", drawCard);
  cardElement.querySelector(".wildcard__dismiss").addEventListener("click", putCardBack);
  // Once a put-away card has finished fading out, take it out of the page.
  cardElement.addEventListener("transitionend", (event) => {
    const isFadedOut = !cardElement.classList.contains("wildcard--open");
    if (event.propertyName === "opacity" && isFadedOut) cardElement.hidden = true;
  });
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
async function restartStory() {
  const hasWriting = story.some((turn) => turn.role === "human");
  if (hasWriting) {
    const isConfirmed = await MM.confirm({
      title: "Start a new story?",
      message:
        "The current story will be cleared. Download it first if you want to keep it.",
      confirmLabel: "Start a new story",
      cancelLabel: "Keep writing",
    });
    if (!isConfirmed) return;
  }

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

  if (isBusy) storyElement.append(thinkingElement());

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

  const speaker = MM.el("span", "story__speaker", turn.role === "ai" ? "AI" : "You");
  paragraph.append(speaker, MM.el("span", "story__text", turn.text));

  if (turn.card) paragraph.append(cardNote(turn));
  return paragraph;
}

// The wild card that went with a sentence: its words as small chips, with the ones the
// sentence used lit up (see the CSS).
function cardNote(turn) {
  const note = MM.el("span", "story__card");
  note.setAttribute("role", "group");
  note.setAttribute("aria-label", "Wild card");

  const icon = cardIcon.cloneNode(true);
  icon.classList.add("story__card-icon");
  note.append(icon);

  const sentence = turn.text.toLowerCase();
  for (const word of [].concat(turn.card)) {
    const isUsed = sentence.includes(word.toLowerCase());
    note.append(
      MM.el("span", isUsed ? "story__chip story__chip--used" : "story__chip", word)
    );
  }
  return note;
}

// The machine's turn while it is still writing: three dots that bounce (see the CSS).
function thinkingElement() {
  const dots = MM.el("span", "story__dots");
  dots.setAttribute("role", "img");
  dots.setAttribute("aria-label", "AI is thinking");
  for (let i = 0; i < 3; i++) dots.append(MM.el("span", "story__dot"));

  const paragraph = MM.el("p", "story__turn story__turn--ai");
  paragraph.append(MM.el("span", "story__speaker", "AI"), dots);
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
  updateChips();
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

// `animate: false` shows the card at once, for a card restored after a reload.
function setDrawnCard(card, { animate = true } = {}) {
  drawnCard = card;
  saveCards();
  if (!card) {
    hideCard();
    return;
  }

  // The card's words, one chip (a button) each. Added as text, never as HTML.
  const words = card.words.map((word) => {
    const chip = MM.el("button", "wildcard__word", word);
    chip.type = "button";
    chip.addEventListener("click", () => insertWord(word));
    const item = MM.el("li");
    item.append(chip);
    return item;
  });
  cardElement.querySelector(".wildcard__words").replaceChildren(...words);
  updateChips();
  showCard(animate);
  input.focus();
}

// Puts a card word into the text field where the caret is (or over the selected text),
// with a space on either side where one is needed, then carries on typing from there.
function insertWord(word) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const before = input.value.slice(0, start);
  const after = input.value.slice(end);

  const spaceBefore = before !== "" && !/\s$/.test(before) ? " " : "";
  const spaceAfter = after !== "" && !/^[\s.,;:!?)]/.test(after) ? " " : "";
  const text = spaceBefore + word + spaceAfter;

  // The field's length limit only stops typing, so it has to be checked here.
  if (before.length + text.length + after.length > input.maxLength) return;

  input.focus();
  input.setRangeText(text, start, end, "end"); // "end" puts the caret after the word
  updateChips();
}

// Words that are already in the sentence are dimmed (and can't be added twice), and so
// are all of them once the story is full. Deleting a word from the sentence brings it back.
function updateChips() {
  const sentence = input.value.toLowerCase();
  for (const chip of cardElement.querySelectorAll(".wildcard__word")) {
    const isUsed = sentence.includes(chip.textContent.toLowerCase());
    chip.disabled = isUsed || input.disabled;
  }
}

// The card slides up and fades in (the CSS does the moving; the class below starts it).
function showCard(animate) {
  const wasHidden = cardElement.hidden;
  cardElement.hidden = false;
  // Let the browser draw the faded-out card first, or there is nothing to animate from.
  if (wasHidden && animate) void cardElement.offsetWidth;
  cardElement.classList.add("wildcard--open");

  // The card takes room from the story, so keep the newest sentence in view.
  scroller.scrollTop = scroller.scrollHeight;
}

// Putting the card away plays the same animation backwards. It stays in the page until
// it has faded out (see the transitionend listener in init).
function hideCard() {
  cardElement.classList.remove("wildcard--open");
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
    if (card) setDrawnCard(card, { animate: false });
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
