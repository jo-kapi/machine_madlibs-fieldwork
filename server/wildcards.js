// Wild cards live in public/data/wildcards.json so they can be edited without
// touching code. The file is read on every use, so edits apply immediately.
import fs from "node:fs/promises";
import path from "node:path";
import { publicDir } from "./paths.js";

const file = path.join(publicDir, "data", "wildcards.json");

export async function findCard(id) {
  try {
    const cards = JSON.parse(await fs.readFile(file, "utf8"));
    return cards.find((card) => card.id === id) ?? null;
  } catch {
    return null;
  }
}
