// A small concurrency limiter: at most `concurrency` tasks run at once, the
// rest wait in a first-in-first-out queue. Waiting tasks can be cancelled with
// an AbortSignal, so a phone that disconnects never takes up a slot.

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
