// Settings come from environment variables, optionally loaded from a .env file
// (copy .env.example to .env). Also the folders the server serves from.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const publicDir = path.join(rootDir, "public");
// The projector screen and gallery. Never served to participants.
export const hostDir = path.join(rootDir, "host");

try {
  process.loadEnvFile();
} catch {
  // No .env file: defaults and real environment variables are used.
}

// The version lives in package.json only.
function readVersion() {
  try {
    const file = path.join(rootDir, "package.json");
    return JSON.parse(fs.readFileSync(file, "utf8")).version ?? "";
  } catch {
    return "";
  }
}

function int(name, fallback) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const config = {
  version: readVersion(),
  port: int("PORT", 3000),
  // Activities 1 and 2: writing, poetry and colors.
  model: process.env.MODEL || "mistral-small:24b",
  // Activity 3 (Temp Check). Separate because the game needs a model whose answers
  // visibly spread out as temperature rises.
  tempModel: process.env.TEMP_MODEL || "llama3.2",
  ollamaUrl: (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, ""),
  // Replaces the detected LAN address on the host screen and in the printed address,
  // for example "http://192.168.100.100:3000".
  publicUrl: (process.env.PUBLIC_URL || "").replace(/\/$/, ""),
  // Link shown at the end of Temp Check.
  googleFormUrl: process.env.GOOGLE_FORM_URL || "",
  // Requests that run at once. Match Ollama's OLLAMA_NUM_PARALLEL.
  maxParallel: int("MAX_PARALLEL", 4),
  // Requests that may wait for a free slot before new ones are refused.
  maxQueue: int("MAX_QUEUE", 100),
  requestTimeoutMs: int("REQUEST_TIMEOUT_MS", 60000),
  // Context window sent with every request. Ollama's default can use many GB of
  // memory, and changing it between requests makes Ollama reload the model, so keep
  // it constant.
  numCtx: int("NUM_CTX", 4096),
};

// The models this setup needs, one entry each. If MODEL and TEMP_MODEL match,
// there is a single entry.
export function modelsInUse() {
  if (config.model === config.tempModel) {
    return [{ name: config.model, usedFor: "all activities" }];
  }
  return [
    { name: config.model, usedFor: "Activities 1 and 2" },
    { name: config.tempModel, usedFor: "Activity 3, Temp Check" },
  ];
}
