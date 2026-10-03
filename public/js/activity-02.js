// DOM Elements
let saveButton,
  sendButton,
  keywordForm,
  canvasBgForm,
  textColorForm,
  textBgForm,
  fontSizeBtns,
  fontToggle;

// Initialize the app
function init() {
  // First-time visitors are sent to the join page.
  if (!MM.requireIdentity()) return;
  MM.initInfoPanels();

  // Cache DOM elements
  saveButton = document.querySelector(".save-btn");
  sendButton = document.querySelector(".send-btn");
  keywordForm = document.querySelector("#form-keywords");
  canvasBgForm = document.querySelector("#form-canvas-bg");
  textColorForm = document.querySelector("#form-text-fg");
  textBgForm = document.querySelector("#form-text-bg");
  fontSizeBtns = Array.from(document.querySelectorAll(".font-sizes .size"));
  fontToggle = document.querySelector(".font-toggle");

  // Set up event listeners
  setupEventListeners();
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

  // Font size buttons
  fontSizeBtns.forEach((btn) => {
    btn.addEventListener("click", handleFontSizeClick);
  });

  // Font toggle button
  fontToggle.addEventListener("click", handleFontToggle);
}

// Runs a request with the form's button disabled. Errors are shown on the page.
async function runBusy(form, task) {
  const button = form.querySelector("button");
  button.disabled = true;
  form.setAttribute("aria-busy", "true");
  MM.clearNotice();
  try {
    await task();
  } catch (error) {
    MM.notice(error.message, "error");
  } finally {
    button.disabled = false;
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
    bgColorInput.value = sketchBg;
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
    if (wordTiles[activeTileIndex] === tile) textColorInput.value = tile.c;
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
    if (wordTiles[activeTileIndex] === tile) textBgInput.value = tile.bg;
  });
}

// Handle font size button clicks
function handleFontSizeClick(e) {
  if (!requireActiveTile()) return;

  // Remove selection from all buttons
  fontSizeBtns.forEach((btn) => btn.classList.remove("selected"));

  // Apply size and select button
  const btn = e.target;
  const sizeMap = {
    XS: 8,
    S: 12,
    M: 16,
    L: 20,
    XL: 24,
  };

  const size = sizeMap[btn.textContent];
  if (size) {
    wordTiles[activeTileIndex].sz = size;
    btn.classList.add("selected");
  }
}

// Handle font toggle button click
function handleFontToggle() {
  if (!requireActiveTile()) return;

  const currentTile = wordTiles[activeTileIndex];

  // Toggle between serif and sans-serif
  if (currentTile.font === "serif") {
    currentTile.font = "sans-serif";
    fontToggle.textContent = "Sans-serif";
    fontToggle.classList.remove("serif");
  } else {
    currentTile.font = "serif";
    fontToggle.textContent = "Serif";
    fontToggle.classList.add("serif");
  }
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
}

// Create a word element
function createWordElement(word) {
  const wordElement = document.createElement("div");
  wordElement.classList.add("word");
  wordElement.textContent = word;
  wordElement.addEventListener("click", toggleWord);
  return wordElement;
}

// Toggle word selection and add/remove from canvas
function toggleWord(e) {
  const wordElement = e.target;
  const targetHash = wordElement.dataset.hash;

  if (wordElement.classList.contains("used")) {
    // Remove from canvas
    const index = wordTiles.findIndex((tile) => tile.hash === targetHash);
    if (index !== -1) {
      wordTiles.splice(index, 1);
    }
  } else {
    // Add to canvas
    const hash = Date.now().toString();
    wordElement.dataset.hash = hash;

    const newTile = {
      hash: hash,
      text: wordElement.textContent,
      x: width / 2 - 50, // Center with slight offset
      y: height / 2 - 10,
      w: 0,
      h: 0,
      bg: "#000",
      c: "#fff",
      sz: 16,
      font: "sans-serif", // Default font
    };

    wordTiles.push(newTile);
  }

  wordElement.classList.toggle("used");
}

// Update editor interface with selected tile properties
function updateEditor(tile) {
  const textColorInput = document.querySelector("#text-fg");
  const textBgInput = document.querySelector("#text-bg");

  // Update color inputs
  textColorInput.value = tile.c;
  textBgInput.value = tile.bg;

  // Update font size selection
  fontSizeBtns.forEach((btn) => btn.classList.remove("selected"));

  const sizeButtonMap = {
    8: 0, // XS
    12: 1, // S
    16: 2, // M
    20: 3, // L
    24: 4, // XL
  };

  const buttonIndex = sizeButtonMap[tile.sz] || 2; // Default to M
  fontSizeBtns[buttonIndex].classList.add("selected");

  // Update font toggle
  if (tile.font === "serif") {
    fontToggle.textContent = "Serif";
    fontToggle.classList.add("serif");
  } else {
    fontToggle.textContent = "Sans-serif";
    fontToggle.classList.remove("serif");
  }
}

// Clear editor selection
function clearEditor() {
  document.querySelector("#text-fg").value = "";
  document.querySelector("#text-bg").value = "";
  fontSizeBtns.forEach((btn) => btn.classList.remove("selected"));
  fontToggle.textContent = "Sans-serif";
  fontToggle.classList.remove("serif");
}

// Download canvas as image
function downloadImage() {
  // Clear selection before download
  activeTileIndex = null;
  clearEditor();
  // Redraw first, so the selection outline isn't saved into the image.
  redraw();

  saveCanvas(`mm_visual-poetry_${MM.timestamp()}`, "png");
}

// ---------- send to the shared screen ----------

const MAX_SEND_SIDE = 1600; // pixels on the longest side
const MAX_SEND_BYTES = 5 * 1024 * 1024;

// The canvas as a PNG data URL, scaled down to fit the size limits.
function canvasForSending() {
  // Redraw first, so the selection outline isn't included.
  activeTileIndex = null;
  clearEditor();
  redraw();

  const source = document.querySelector(".preview canvas");
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
  sendButton.disabled = true;
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
    sendButton.disabled = false;
  }
}

// Start the app when DOM is ready
document.addEventListener("DOMContentLoaded", init);
