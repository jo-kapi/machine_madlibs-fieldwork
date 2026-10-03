// Visual Poetry images that participants send to the shared screen.
// They live in memory only and are forgotten when the server stops.
import { randomBytes } from "node:crypto";
import { InputError } from "./errors.js";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;
const MAX_ITEMS = 300;
const PNG_PREFIX = "data:image/png;base64,";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export class Gallery {
  constructor() {
    this.items = []; // { id, name, pronouns, at, png }
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    for (const listener of this.listeners) listener();
  }

  // Stores a PNG sent as a data URL, captioned with the sender's details.
  add({ name, pronouns }, dataUrl) {
    if (typeof dataUrl !== "string" || !dataUrl.startsWith(PNG_PREFIX)) {
      throw new InputError("The image must be a PNG.");
    }
    const png = Buffer.from(dataUrl.slice(PNG_PREFIX.length), "base64");
    if (png.length === 0 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) {
      throw new InputError("The image must be a PNG.");
    }
    if (png.length > MAX_IMAGE_BYTES) {
      throw new InputError("The image is too large (max 5 MB).", 413);
    }
    const total = this.items.reduce((sum, item) => sum + item.png.length, png.length);
    if (this.items.length >= MAX_ITEMS || total > MAX_TOTAL_BYTES) {
      throw new InputError("The gallery is full.", 503);
    }

    const item = {
      id: randomBytes(8).toString("hex"),
      name,
      pronouns,
      at: Date.now(),
      png,
    };
    this.items.push(item);
    this.emit();
    return item.id;
  }

  // Details for the host's grid. The image bytes are fetched separately.
  list() {
    return this.items.map(({ id, name, pronouns, at }) => ({ id, name, pronouns, at }));
  }

  get(id) {
    return this.items.find((item) => item.id === id) ?? null;
  }

  remove(id) {
    const before = this.items.length;
    this.items = this.items.filter((item) => item.id !== id);
    if (this.items.length !== before) this.emit();
    return this.items.length !== before;
  }

  clear() {
    this.items = [];
    this.emit();
  }
}
