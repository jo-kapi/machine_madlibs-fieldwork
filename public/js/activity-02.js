// DOM Elements
let saveButton,
  sendButton,
  keywordForm,
  canvasBgForm,
  textColorForm,
  textBgForm,
  editor,
  removeButton,
  canvasHint,
  sizeButtons,
  fontButtons;

// Initialize the app
function init() {
  // First-time visitors are sent to the join page.
  if (!MM.requireIdentity()) return;
  Peek.init();
  Instructions.init("activity-02");

  // Cache DOM elements
  saveButton = document.querySelector(".toolbar__download");
  sendButton = document.querySelector(".toolbar__send");
  keywordForm = document.querySelector("#form-keywords");
  canvasBgForm = document.querySelector("#form-canvas-bg");
  textColorForm = document.querySelector("#form-text-fg");
  textBgForm = document.querySelector("#form-text-bg");
  editor = document.querySelector(".editor");
  removeButton = document.querySelector(".editor__remove");
  canvasHint = document.querySelector(".preview__hint");
  sizeButtons = Array.from(document.querySelectorAll("[data-size]"));
  fontButtons = Array.from(document.querySelectorAll("[data-font]"));

  // Set up event listeners
  setupEventListeners();
  updateCanvasHint();
}

// Set up all event listeners
function setupEventListeners() {
  // Download button
  saveButton.addEventListener("click", downloadImage);
  sendButton.addEventListener("click", sendToScreen);

  // Form submissions
  keywordForm.addEventListener("submit", handleKeywordSubmit);
  canvasBgForm.addEventListener("submit", handleCanvasBgSubmit);
  textColorForm.addEventListener("submit", handleTextColorSubmit);
  textBgForm.addEventListener("submit", handleTextBgSubmit);

  // Size and font choices
  sizeButtons.forEach((button) => button.addEventListener("click", handleSizeClick));
  fontButtons.forEach((button) => button.addEventListener("click", handleFontClick));

  // Taking the selected word off the canvas
  removeButton.addEventListener("click", handleRemoveClick);
  document.addEventListener("keydown", handleKeydown);

  // The dots in the color fields are color pickers.
  setupPicker("#canvas-bg", false, (hex) => (sketchBg = hex));
  setupPicker("#text-fg", true, (hex, tile) => (tile.c = hex));
  setupPicker("#text-bg", true, (hex, tile) => (tile.bg = hex));
}

// Runs a request while the form's button shows that the machine is working. Errors
// are shown on the page.
async function runBusy(form, task) {
  const button = form.querySelector("button");
  MM.setBusy(button, true);
  form.setAttribute("aria-busy", "true");
  MM.clearNotice();
  try {
    await task();
  } catch (error) {
    MM.notice(error.message, "error");
  } finally {
    MM.setBusy(button, false);
    form.removeAttribute("aria-busy");
  }
}

// Returns the selected tile, or tells the person to select one.
function requireActiveTile() {
  const tile = wordTiles[activeTileIndex];
  if (!tile) MM.notice("Select a word on the canvas first.");
  return tile;
}

// Handle keyword form submission
async function handleKeywordSubmit(event) {
  event.preventDefault();
  const keywordInput = document.querySelector("#input-keyword");
  const keyword = keywordInput.value.trim();

  await runBusy(keywordForm, async () => {
    // An empty keyword asks for filler words (articles and prepositions).
    const { words } = await MM.api("poet", { theme: keyword });
    appendWords(words);
    keywordInput.value = "";
  });
}

// Handle canvas background form submission
async function handleCanvasBgSubmit(event) {
  event.preventDefault();
  const bgColorInput = document.querySelector("#canvas-bg");
  const bgColor = bgColorInput.value.trim();
  if (!bgColor) return;

  await runBusy(canvasBgForm, async () => {
    sketchBg = await resolveColor(bgColor);
    showColor(bgColorInput, sketchBg);
  });
}

// Handle text color form submission
async function handleTextColorSubmit(event) {
  event.preventDefault();
  const textColorInput = document.querySelector("#text-fg");
  const textColor = textColorInput.value.trim();
  const tile = requireActiveTile();
  if (!tile || !textColor) return;

  // Keep hold of the tile itself: the selection may change while the machine thinks.
  await runBusy(textColorForm, async () => {
    tile.c = await resolveColor(textColor);
    if (wordTiles[activeTileIndex] === tile) showColor(textColorInput, tile.c);
  });
}

// Handle text background form submission
async function handleTextBgSubmit(event) {
  event.preventDefault();
  const textBgInput = document.querySelector("#text-bg");
  const textBg = textBgInput.value.trim();
  const tile = requireActiveTile();
  if (!tile || !textBg) return;

  await runBusy(textBgForm, async () => {
    tile.bg = await resolveColor(textBg);
    if (wordTiles[activeTileIndex] === tile) showColor(textBgInput, tile.bg);
  });
}

// Handle size button clicks
function handleSizeClick(event) {
  const tile = requireActiveTile();
  if (!tile) return;

  tile.sz = Number(event.currentTarget.dataset.size);
  showChoice(sizeButtons, "size", tile.sz);
}

// Handle font button clicks
function handleFontClick(event) {
  const tile = requireActiveTile();
  if (!tile) return;

  tile.font = event.currentTarget.dataset.font;
  showChoice(fontButtons, "font", tile.font);
}

// Marks the button whose data attribute matches the value as pressed, and slides the
// pill behind it (see .segmented in forms.css). A value of null leaves none pressed.
function showChoice(buttons, attribute, value) {
  const group = buttons[0].parentElement;
  const index = buttons.findIndex(
    (button) => String(button.dataset[attribute]) === String(value)
  );

  buttons.forEach((button, i) =>
    button.setAttribute("aria-pressed", String(i === index))
  );
  group.style.setProperty("--count", buttons.length);

  if (index >= 0) {
    group.style.setProperty("--index", index);
    // Reading a layout property makes the browser apply the new position now. Without
    // it, the pill would start fading in while still sliding from its old place.
    void group.offsetWidth;
  }
  group.classList.toggle("segmented--empty", index < 0);
}

// Fills the dot inside a color field. No color leaves an empty ring.
function showSwatch(input, color) {
  const swatch = input.parentElement.querySelector(".controls__swatch");
  swatch.style.backgroundColor = color || "";
  // The picker under the dot opens on this color.
  if (color) swatch.querySelector(".controls__picker").value = toPickerValue(color);
}

// A color picker only takes 6-digit hex codes, so #abc becomes #aabbcc.
function toPickerValue(hex) {
  if (!/^#[0-9a-f]{3}$/i.test(hex)) return hex;
  return "#" + [...hex.slice(1)].map((digit) => digit + digit).join("");
}

// Makes the dot in a color field a color picker. `apply` is given the picked hex code
// (and the selected word, if `needsTile`) and changes the poem.
function setupPicker(selector, needsTile, apply) {
  const textInput = document.querySelector(selector);
  const picker = textInput.parentElement.querySelector(".controls__picker");

  // With no word selected there is nothing to color: say so instead of opening it.
  picker.addEventListener("click", (event) => {
    if (needsTile && !requireActiveTile()) event.preventDefault();
  });

  // "input" fires as the color is dragged around, so the canvas follows along.
  picker.addEventListener("input", () => {
    const tile = wordTiles[activeTileIndex];
    if (needsTile && !tile) return;
    apply(picker.value, tile);
    showColor(textInput, picker.value);
  });
}

// Shows a color in a field: its hex code as text, and the dot.
function showColor(input, color) {
  input.value = color || "";
  showSwatch(input, color);
}

// Validate hex color format
function isValidHexColor(color) {
  // Check if it starts with # and has valid hex format
  const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  return hexRegex.test(color);
}

// Hex codes apply directly. Anything else is described to the machine,
// which answers with a hex code (or an error that the caller shows).
async function resolveColor(text) {
  if (isValidHexColor(text)) return text;
  const { hex } = await MM.api("color", { description: text });
  return hex;
}

// Append words to the word palette
function appendWords(wordsArray) {
  const wordsContainer = document.querySelector(".words");

  wordsArray.forEach((word) => {
    if (word.trim()) {
      // Only add non-empty words
      const wordElement = createWordElement(word);
      wordsContainer.appendChild(wordElement);
    }
  });
  updateCanvasHint();
}

// Create a word element
function createWordElement(word) {
  const wordElement = document.createElement("button");
  wordElement.type = "button";
  wordElement.classList.add("word");
  wordElement.setAttribute("aria-pressed", "false");
  wordElement.textContent = word;
  wordElement.addEventListener("click", toggleWord);
  return wordElement;
}

// Puts a word on the canvas, or takes it off if it is already there.
function toggleWord(event) {
  const chip = event.currentTarget;
  const tileOnCanvas = wordTiles.find((tile) => tile.chip === chip);
  if (tileOnCanvas) {
    removeTile(tileOnCanvas);
    return;
  }

  const newTile = {
    text: chip.textContent,
    chip, // the word in the palette, so it can be switched off again
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    bg: "#000",
    c: "#fff",
    sz: 16,
    font: "sans-serif", // Default font
  };
  placeTile(newTile);
  wordTiles.push(newTile);
  chip.setAttribute("aria-pressed", "true");

  // Select it, so its color, size and font can be changed straight away.
  activeTileIndex = wordTiles.length - 1;
  isDragging = false;
  updateEditor(newTile);
  updateCanvasHint();
}

// Takes a word off the canvas and puts its chip back to normal.
function removeTile(tile) {
  const index = wordTiles.indexOf(tile);
  if (index === -1) return;

  wordTiles.splice(index, 1);
  tile.chip.setAttribute("aria-pressed", "false");

  // Keep the selection on the same tile, or drop it if that tile was removed.
  if (index === activeTileIndex) {
    activeTileIndex = null;
    clearEditor();
  } else if (activeTileIndex !== null && index < activeTileIndex) {
    activeTileIndex--;
  }
  updateCanvasHint();
}

function handleRemoveClick() {
  const tile = requireActiveTile();
  if (tile) removeTile(tile);
}

// Delete or Backspace takes the selected word off the canvas, unless you are typing in
// a field or a dialog is open.
function handleKeydown(event) {
  if (event.key !== "Delete" && event.key !== "Backspace") return;
  if (event.target.closest?.("input, textarea, select")) return;
  if (document.querySelector("dialog[open]")) return;

  const tile = wordTiles[activeTileIndex];
  if (!tile) return;
  event.preventDefault(); // Backspace can also mean "go back" in some browsers
  removeTile(tile);
}

// Tells an empty canvas what to do next. Hidden once a word is on it.
function updateCanvasHint() {
  const hasWords = document.querySelector(".word") !== null;
  canvasHint.textContent = hasWords
    ? "Pick a word to place it here."
    : "Generate some words to begin.";
  canvasHint.hidden = wordTiles.length > 0;
}

// Update editor interface with selected tile properties
function updateEditor(tile) {
  showColor(document.querySelector("#text-fg"), tile.c);
  showColor(document.querySelector("#text-bg"), tile.bg);
  showChoice(sizeButtons, "size", tile.sz);
  showChoice(fontButtons, "font", tile.font);
  editor.classList.remove("editor--idle");
}

// Clear editor selection
function clearEditor() {
  showColor(document.querySelector("#text-fg"), null);
  showColor(document.querySelector("#text-bg"), null);
  showChoice(sizeButtons, "size", null);
  showChoice(fontButtons, "font", null);
  editor.classList.add("editor--idle");
}

// Download canvas as image
function downloadImage() {
  // Without the selection outline, which would be saved into the image.
  canvasWithoutSelection();
  saveCanvas(`mm_visual-poetry_${MM.timestamp()}`, "png");
}

// ---------- send to the shared screen ----------

const MAX_SEND_SIDE = 1600; // pixels on the longest side
const MAX_SEND_BYTES = 5 * 1024 * 1024;

// The canvas as a PNG data URL, scaled down to fit the size limits.
function canvasForSending() {
  // Without the selection outline.
  const source = canvasWithoutSelection();
  let scale = Math.min(1, MAX_SEND_SIDE / Math.max(source.width, source.height));

  for (let attempt = 0; attempt < 4; attempt++) {
    const target = document.createElement("canvas");
    target.width = Math.round(source.width * scale);
    target.height = Math.round(source.height * scale);
    target.getContext("2d").drawImage(source, 0, 0, target.width, target.height);

    const dataUrl = target.toDataURL("image/png");
    // Base64 text is about a third larger than the bytes it encodes.
    if (dataUrl.length * 0.75 <= MAX_SEND_BYTES) return dataUrl;
    scale *= 0.7;
  }
  throw new Error("The image is too large to send.");
}

// Sends the canvas to the host's gallery, captioned with your name and pronouns
// (the server adds those from your join details).
async function sendToScreen() {
  MM.setBusy(sendButton, true);
  MM.clearNotice();
  try {
    const image = canvasForSending();
    const send = () => MM.api("gallery", { id: MM.getIdentity().id, image });
    try {
      await send();
    } catch (error) {
      // The server forgets people when it restarts: join again, then retry once.
      if (!/join first/i.test(error.message)) throw error;
      await MM.joinSession(MM.getIdentity());
      await send();
    }
    MM.notice("Sent to the big screen!");
  } catch (error) {
    MM.notice(error.message, "error");
  } finally {
    MM.setBusy(sendButton, false);
  }
}

// Start the app when DOM is ready
document.addEventListener("DOMContentLoaded", init);
