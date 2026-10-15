// The only code that talks to Ollama, through its native /api/chat endpoint. `chat` goes
// through the shared concurrency limiter; `rawChat` skips it (used for the warm-up).
import { config } from "./config.js";

// ---------- concurrency limiter ----------

// At most `concurrency` tasks run at once and the rest wait in a first-in-first-out
// queue. Waiting tasks can be canceled with an AbortSignal, so a phone that
// disconnects never takes up a slot.
export class QueueFullError extends Error {
  constructor() {
    super("Too many requests waiting");
    this.name = "QueueFullError";
  }
}

export function createLimiter(concurrency, maxQueue = Infinity) {
  let active = 0;
  const queue = [];

  function next() {
    while (active < concurrency && queue.length > 0) {
      const job = queue.shift();
      active++;
      Promise.resolve()
        .then(job.task)
        .then(job.resolve, job.reject)
        .finally(() => {
          active--;
          next();
        });
    }
  }

  function run(task, { signal } = {}) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason);
      if (queue.length >= maxQueue) return reject(new QueueFullError());

      const job = { task, resolve, reject };
      queue.push(job);

      signal?.addEventListener(
        "abort",
        () => {
          const index = queue.indexOf(job);
          if (index === -1) return; // already running; the task handles the signal
          queue.splice(index, 1);
          reject(signal.reason);
        },
        { once: true }
      );

      next();
    });
  }

  return {
    run,
    get active() {
      return active;
    },
    get queued() {
      return queue.length;
    },
  };
}

export const limiter = createLimiter(config.maxParallel, config.maxQueue);

// ---------- chat ----------

export class OllamaError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "OllamaError";
    this.status = status;
  }
}

// Pass `system` and `user` for a single question, or `messages` (a list of
// { role, content }) for a conversation; the system prompt always goes first.
export async function rawChat({
  system,
  user,
  messages = [{ role: "user", content: user }],
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
        messages: [{ role: "system", content: system }, ...messages],
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
