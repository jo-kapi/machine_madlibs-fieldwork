// Global variables for p5.js canvas
const wordTiles = [];
let activeTileIndex = null;
let sketchBg;
let isDragging = false;
let offsetX, offsetY;
let selectionColor;
let sansFont;
let serifFont;

// The canvas is the largest square that fits its container.
function canvasSize() {
  const parent = document.querySelector(".preview");
  return Math.floor(Math.min(parent.clientWidth, parent.clientHeight));
}

// p5.js setup function
function setup() {
  const parentElement = document.querySelector(".preview");
  const canvasSizeValue = canvasSize();

  let canvas = createCanvas(canvasSizeValue, canvasSizeValue);
  canvas.parent(parentElement);

  sketchBg = color(230);
  background(sketchBg);

  // The selection colour comes from the design tokens in css/tokens.css.
  const tokens = getComputedStyle(document.documentElement);
  selectionColor = tokens.getPropertyValue("--color-selection").trim() || "#ff3b5b";
  // Tiles use the same fonts as the rest of the app.
  sansFont = tokens.getPropertyValue("--font-ui").trim() || "Arial";
  serifFont = tokens.getPropertyValue("--font-serif").trim() || "Georgia";

  // Refit whenever the container's size changes: a resized window, a collapsed
  // instructions panel, a rotated tablet.
  new ResizeObserver(fitCanvas).observe(parentElement);
}

// Fits the canvas to its container, moving tiles with it.
function fitCanvas() {
  const newSize = canvasSize();
  if (newSize < 1 || Math.abs(newSize - width) < 2) return;

  const scale = newSize / width;
  wordTiles.forEach((tile) => {
    tile.x *= scale;
    tile.y *= scale;
  });
  resizeCanvas(newSize, newSize);
}

// p5.js draw function
function draw() {
  background(sketchBg);

  for (let i = 0; i < wordTiles.length; i++) {
    const tile = wordTiles[i];

    // Set font family based on tile font property
    textFont(tile.font === "serif" ? serifFont : sansFont);

    textSize(tile.sz);
    textAlign(CENTER, CENTER);

    let textWidthValue = textWidth(tile.text);
    let textHeightValue = tile.sz * 1.2;
    const padding = 20;

    tile.w = textWidthValue + padding;
    tile.h = textHeightValue + padding;

    // Draw tile background
    fill(tile.bg);
    if (i === activeTileIndex) {
      stroke(selectionColor);
      strokeWeight(2);
    } else {
      noStroke();
    }
    rect(tile.x, tile.y, tile.w, tile.h);

    // Draw text
    fill(tile.c);
    noStroke();
    text(tile.text, tile.x + tile.w / 2, tile.y + tile.h / 2);
  }
}

// Selects the top-most tile at (x, y) and starts dragging it.
// Returns true if a tile was hit.
function pressAt(x, y) {
  // Check if the pointer is within canvas bounds
  if (x < 0 || x > width || y < 0 || y > height) {
    return false;
  }

  // Start from the top-most tile and check if the pointer is within bounds
  for (let i = wordTiles.length - 1; i >= 0; i--) {
    const tile = wordTiles[i];
    if (x > tile.x && x < tile.x + tile.w && y > tile.y && y < tile.y + tile.h) {
      activeTileIndex = i;
      isDragging = true;
      // Calculate offset for smooth dragging
      offsetX = x - tile.x;
      offsetY = y - tile.y;
      // Update editor with current tile properties
      updateEditor(wordTiles[activeTileIndex]);
      return true;
    }
  }

  // If no tile was hit, clear selection
  activeTileIndex = null;
  clearEditor();
  return false;
}

function dragTo(x, y) {
  if (isDragging && activeTileIndex !== null) {
    const tile = wordTiles[activeTileIndex];
    // Update tile position, keeping it within canvas bounds
    tile.x = Math.max(0, Math.min(width - tile.w, x - offsetX));
    tile.y = Math.max(0, Math.min(height - tile.h, y - offsetY));
  }
}

// Mouse and touch. Since p5 2.0, touches arrive through these same functions.
function mousePressed() {
  pressAt(mouseX, mouseY);
}

function mouseDragged() {
  dragTo(mouseX, mouseY);
}

function mouseReleased() {
  isDragging = false;
}

function doubleClicked() {
  // Clear selection on double click in empty area
  if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
    activeTileIndex = null;
    clearEditor();
  }
}
