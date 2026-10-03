// Thin client for Ollama's native /api/chat endpoint.
// `chat` goes through the shared limiter; `rawChat` skips it (used by scripts).
import { config } from "./config.js";
import { createLimiter, QueueFullError } from "./limiter.js";

export const limiter = createLimiter(config.maxParallel, config.maxQueue);

export class OllamaError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "OllamaError";
    this.status = status;
  }
}

export async function rawChat({
  system,
  user,
  options = {},
  model = config.model,
  timeoutMs = config.requestTimeoutMs,
  signal,
}) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response;
  try {
    response = await fetch(`${config.ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        // Reasoning models would otherwise spend time on hidden thinking tokens.
        think: false,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        options: { num_ctx: config.numCtx, ...options },
      }),
      signal: combined,
    });
  } catch (error) {
    if (signal?.aborted) throw error; // the caller gave up
    if (timeout.aborted) throw new OllamaError("The model took too long to answer.", 504);
    throw new OllamaError("Can't reach Ollama. Is it running?", 502);
  }

  if (!response.ok) {
    const detail = await response
      .json()
      .then((body) => body.error)
      .catch(() => "");
    console.error(`Ollama returned ${response.status}${detail ? `: ${detail}` : ""}`);
    throw new OllamaError("The model returned an error.", 502);
  }

  const data = await response.json();
  return { text: (data.message?.content ?? "").trim() };
}

export async function chat(args) {
  try {
    return await limiter.run(() => rawChat(args), { signal: args.signal });
  } catch (error) {
    if (error instanceof QueueFullError) {
      throw new OllamaError("The machine is busy. Try again in a moment.", 503);
    }
    throw error;
  }
}

// Returns the installed model tags, or null if Ollama can't be reached.
export async function listModels() {
  try {
    const response = await fetch(`${config.ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return (data.models ?? []).map((model) => model.name);
  } catch {
    return null;
  }
}

// "llama3.2" and "llama3.2:latest" name the same model.
export function hasModel(installed, wanted) {
  const withTag = (name) => (name.includes(":") ? name : `${name}:latest`);
  return installed.map(withTag).includes(withTag(wanted));
}
