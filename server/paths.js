import path from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const publicDir = path.join(rootDir, "public");
// Pages that must never be served to participants.
export const hostDir = path.join(rootDir, "host");
