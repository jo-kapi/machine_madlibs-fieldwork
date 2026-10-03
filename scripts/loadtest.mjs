// Simulates a room of participants against a running server and reports how it
// copes. Start the app first (npm start), then run:
//
//   npm run loadtest
//   node scripts/loadtest.mjs --url http://localhost:3000 --clients 20 --rounds 3
//
// What it does:
//   1. Every client joins and uses Activities 1 and 2 at the same time.
//   2. All clients play Temp Check rounds, driven by a simulated host.
// Run it on the host Mac, because the host controls only accept local requests.
// It resets the Temp Check game when it finishes.

const args = parseArgs(process.argv.slice(2));
const BASE = args.url.replace(/\/$/, "");

function parseArgs(argv) {
  const out = { url: "http://localhost:3000", clients: 20, rounds: 3 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--url") out.url = argv[++i];
    else if (argv[i] === "--clients") out.clients = Number.parseInt(argv[++i], 10);
    else if (argv[i] === "--rounds") out.rounds = Number.parseInt(argv[++i], 10);
  }
  return out;
}

// ---------- helpers ----------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const percentile = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

async function post(path, body) {
  const response = await fetch(`${BASE}/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

const stats = new Map(); // kind -> { times: [], failures: [] }
async function measure(kind, task) {
  const entry = stats.get(kind) ?? { times: [], failures: [] };
  stats.set(kind, entry);
  const start = performance.now();
  try {
    const result = await task();
    entry.times.push(performance.now() - start);
    return result;
  } catch (error) {
    entry.failures.push(error.message);
    return null;
  }
}

// Reads a server-sent event stream, calling onMessage with each parsed message.
function openEvents(path, onMessage, signal) {
  fetch(`${BASE}${path}`, { signal, headers: { Accept: "text/event-stream" } })
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const decoder = new TextDecoder();
      let buffer = "";
      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let end;
        while ((end = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const line = block.split("\n").find((l) => l.startsWith("data:"));
          if (line) onMessage(JSON.parse(line.slice(5)));
        }
      }
    })
    .catch((error) => {
      if (error.name !== "AbortError") console.error(`stream ${path}: ${error.message}`);
    });
}

async function until(predicate, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await sleep(25);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

// ---------- the simulation ----------

const WORDS = ["jelly", "jam", "honey", "butter", "pickle", "marmite", "toast", "ham"];
const pick = (items) => items[Math.floor(Math.random() * items.length)];

async function activities(client) {
  const story = [];
  const opening = await measure("writer: opening", () =>
    post("writer", { mode: "start" })
  );
  if (opening) story.push(opening.text);
  for (let turn = 0; turn < 2 && story.length > 0; turn++) {
    story.push("Then the lights went out.");
    const next = await measure("writer: next sentence", () =>
      post("writer", { mode: "continue", story })
    );
    if (next) story.push(next.text);
  }
  await measure("poet: words", () =>
    post("poet", { theme: pick(["rain", "ocean", "bread"]) })
  );
  await measure("poet: filler", () => post("poet", { theme: "" }));
  await measure("colour", () =>
    post("color", { description: pick(["dusty rose", "storm"]) })
  );
}

async function main() {
  console.log(`Load test: ${args.clients} clients against ${BASE}\n`);

  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  if (!health.ollama || !health.allModelsInstalled) {
    throw new Error("Ollama or a model isn't ready. Run npm run check.");
  }

  // 1. Everyone joins.
  const clients = [];
  for (let i = 0; i < args.clients; i++) {
    const session = await measure("join", () =>
      post("join", { name: `Tester ${i + 1}` })
    );
    if (session) clients.push({ ...session, view: null });
  }

  // 2. Activities 1 and 2, all at once.
  console.log("Activities 1 and 2…");
  await Promise.all(clients.map(activities));

  // 3. Temp Check.
  console.log("Temp Check…");
  const controller = new AbortController();
  let host = null;
  openEvents("/api/host/events", (view) => (host = view), controller.signal);
  for (const client of clients) {
    openEvents(
      `/api/temp/events?id=${client.id}`,
      (view) => (client.view = view),
      controller.signal
    );
  }
  await until(() => host && clients.every((c) => c.view), 10000, "everyone to connect");

  await post("host/command", { action: "reset" });
  await until(() => host.phase === "lobby", 5000, "the lobby");

  const reveals = [];
  const command = (action) => post("host/command", { action });

  for (let round = 0; round < args.rounds; round++) {
    // Advance to this round's intro: from the lobby, or past the previous
    // reveal (and past the leaderboard, when one is shown).
    await command("next");
    await until(
      () => ["intro", "leaderboard", "ended"].includes(host.phase),
      5000,
      "the intro"
    );
    if (host.phase === "leaderboard") {
      await command("next");
      await until(() => host.phase === "intro", 5000, "the intro");
    }
    if (host.phase === "ended") break;
    const { stem, temperature, mode } = host.round;

    await post("host/command", { action: "next" }); // start the clock
    await until(() => host.phase === "input", 5000, "the input phase");
    const endsAt = host.endsAt;

    // Everyone answers at some point in the first few seconds.
    await Promise.all(
      clients.map(async (client) => {
        await sleep(Math.random() * 3000);
        await measure("answer", () =>
          post("temp/answer", { id: client.id, word: pick(WORDS) })
        );
      })
    );

    await until(() => host.phase === "reveal" && !host.thinking, 60000, "the reveal");
    const delay = Date.now() - endsAt;
    reveals.push({
      round: round + 1,
      mode,
      temperature,
      stem,
      delay,
      received: host.results.received,
      requested: host.results.requested,
    });
  }

  await post("host/command", { action: "reset" });
  controller.abort();

  report(reveals);
}

function report(reveals) {
  console.log("\nRequest latency (seconds)");
  console.log(
    "kind".padEnd(24),
    "count".padStart(6),
    "p50".padStart(7),
    "p95".padStart(7),
    "max".padStart(7),
    "failed".padStart(7)
  );
  let failures = 0;
  for (const [kind, { times, failures: failed }] of [...stats.entries()].sort()) {
    const sorted = [...times].sort((a, b) => a - b);
    failures += failed.length;
    const s = (ms) => (ms / 1000).toFixed(2).padStart(7);
    console.log(
      kind.padEnd(24),
      String(sorted.length).padStart(6),
      sorted.length ? s(percentile(sorted, 0.5)) : "      -",
      sorted.length ? s(percentile(sorted, 0.95)) : "      -",
      sorted.length ? s(sorted.at(-1)) : "      -",
      String(failed.length).padStart(7)
    );
  }

  console.log("\nTemp Check rounds");
  for (const r of reveals) {
    console.log(
      `  ${r.round}. ${r.mode} at temperature ${r.temperature}: ` +
        `reveal ${(r.delay / 1000).toFixed(1)} s after input closed ` +
        `(includes a 0.8 s grace for late answers), machine sampled ${r.received}/${r.requested}`
    );
  }

  const slow = reveals.filter((r) => r.delay > 3000);
  console.log("");
  if (failures > 0) console.log(`FAIL: ${failures} request(s) failed.`);
  else if (slow.length > 0)
    console.log(`WARN: ${slow.length} reveal(s) took longer than 3 s.`);
  else console.log("PASS: no failures, and every reveal arrived within 3 s.");
  process.exitCode = failures > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error(`\nLoad test stopped: ${error.message}`);
  process.exit(1);
});
