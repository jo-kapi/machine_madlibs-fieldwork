// Settings come from environment variables, optionally loaded from a .env file.
// Copy .env.example to .env to change them without touching the command line.
try {
  process.loadEnvFile();
} catch {
  // No .env file; defaults and real environment variables are used.
}

function int(name, fallback) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const config = {
  port: int("PORT", 3000),
  // Ollama model for Activities 1 and 2: writing, poetry and colours.
  model: process.env.MODEL || "mistral-small:24b",
  // Ollama model for Activity 3 (Temp Check). It's separate because that game
  // needs a model whose answers visibly spread out as temperature rises.
  tempModel: process.env.TEMP_MODEL || "llama3.2",
  ollamaUrl: (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, ""),
  // Overrides the auto-detected LAN address in the printed address and on the host screen,
  // e.g. "http://192.168.100.100:3000".
  publicUrl: (process.env.PUBLIC_URL || "").replace(/\/$/, ""),
  // Optional link shown on the thank-you screen.
  googleFormUrl: process.env.GOOGLE_FORM_URL || "",
  // Requests allowed to run at once. Match Ollama's OLLAMA_NUM_PARALLEL.
  maxParallel: int("MAX_PARALLEL", 4),
  // Requests allowed to wait for a free slot before new ones are refused.
  maxQueue: int("MAX_QUEUE", 100),
  requestTimeoutMs: int("REQUEST_TIMEOUT_MS", 60000),
  // Context window sent with every request. Ollama's default can be very large
  // (and use many GB of memory); activities here only need a few hundred tokens.
  // Keep it constant: changing it between requests makes Ollama reload the model.
  numCtx: int("NUM_CTX", 4096),
};

// The models this setup needs, without duplicates: one entry per model, with
// what it is used for. If MODEL and TEMP_MODEL are the same, there is one entry.
export function modelsInUse() {
  if (config.model === config.tempModel) {
    return [{ name: config.model, usedFor: "all activities" }];
  }
  return [
    { name: config.model, usedFor: "Activities 1 and 2" },
    { name: config.tempModel, usedFor: "Activity 3, Temp Check" },
  ];
}
