// Global variables for p5.js canvas
const wordTiles = [];
let activeTileIndex = null;
let sketchBg;
let isDragging = false;
let offsetX, offsetY;
let selectionColor;
let sansFont;
let serifFont;

// Tile sizes (the numbers behind XS to XXL) are pixels on a canvas this wide. On a
// smaller or larger canvas the text shrinks or grows with it, so a poem looks the same
// on every screen.
const REFERENCE_SIZE = 640;
const TILE_PADDING = 20;

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

  // The selection color, like the canvas color, comes from the design tokens in
  // css/tokens.css.
  const tokens = getComputedStyle(document.documentElement);
  sketchBg = tokens.getPropertyValue("--color-canvas").trim() || "#e6e6e6";
  background(sketchBg);
  showSwatch(document.querySelector("#canvas-bg"), sketchBg);
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

// Works out a tile's size from its text, font and size, scaled to the canvas.
function measureTile(tile) {
  const scale = width / REFERENCE_SIZE;
  textFont(tile.font === "serif" ? serifFont : sansFont);
  textSize(tile.sz * scale);

  tile.w = textWidth(tile.text) + TILE_PADDING * scale;
  tile.h = tile.sz * scale * 1.2 + TILE_PADDING * scale;
}

// Whether two tiles are touching, or very close.
function overlaps(a, b) {
  const gap = width * 0.01;
  return (
    a.x < b.x + b.w + gap &&
    b.x < a.x + a.w + gap &&
    a.y < b.y + b.h + gap &&
    b.y < a.y + a.h + gap
  );
}

// Puts a new tile on a free spot, so words don't pile up. It tries random spots and
// keeps the first one that touches no other tile (or the last, on a crowded canvas).
function placeTile(tile) {
  measureTile(tile);
  const margin = width * 0.05;

  for (let attempt = 0; attempt < 40; attempt++) {
    tile.x = random(margin, width - tile.w - margin);
    tile.y = random(margin, height - tile.h - margin);
    if (!wordTiles.some((other) => overlaps(tile, other))) return;
  }
}

// p5.js draw function
function draw() {
  background(sketchBg);
  textAlign(CENTER, CENTER);

  for (let i = 0; i < wordTiles.length; i++) {
    const tile = wordTiles[i];
    measureTile(tile);

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

// Clears the selection, draws one frame without its outline, and returns the canvas,
// ready to be saved or sent. It calls draw() itself because redraw() is async: right
// after it, the canvas would still show the previous frame, outline included.
function canvasWithoutSelection() {
  activeTileIndex = null;
  isDragging = false;
  clearEditor();
  draw();
  return document.querySelector(".preview canvas");
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
