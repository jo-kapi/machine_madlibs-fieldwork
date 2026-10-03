// Pre-flight check: run before a session to confirm everything is ready.
//   npm run check
import { config, modelsInUse } from "../server/config.js";
import { PROMPTS } from "../server/prompts.js";
import { listModels, hasModel, rawChat } from "../server/ollama.js";
import { getJoinUrls } from "../server/network.js";
import { loadSchedule } from "../server/schedule.js";

let problems = 0;
const ok = (message) => console.log(`  ✓ ${message}`);
const warn = (message) => console.log(`  ! ${message}`);
const fail = (message, fix) => {
  problems++;
  console.log(`  ✗ ${message}`);
  if (fix) console.log(`      ${fix}`);
};

console.log("\nMachine Madlibs pre-flight check\n");

// 1. Ollama and the models.
console.log("Ollama");
const installed = await listModels();
const ready = [];
if (installed === null) {
  fail(`Can't reach Ollama at ${config.ollamaUrl}`, "Start it with: ollama serve");
} else {
  ok(`Reachable at ${config.ollamaUrl}`);
  for (const { name, usedFor } of modelsInUse()) {
    if (hasModel(installed, name)) {
      ok(`Model "${name}" is installed (${usedFor})`);
      ready.push(name);
    } else {
      fail(`Model "${name}" isn't installed (${usedFor})`, `Run: ollama pull ${name}`);
    }
  }
}

// 2. A warm-up request for each model, which also loads it into memory.
for (const model of ready) {
  try {
    const start = performance.now();
    const { text } = await rawChat({
      model,
      system: PROMPTS.temp.sample.system,
      user: "Peanut butter and ___",
      options: { ...PROMPTS.temp.sample.options, temperature: 0 },
      timeoutMs: 180000,
    });
    const seconds = ((performance.now() - start) / 1000).toFixed(1);
    ok(`${model} answered "${text}" in ${seconds} s (the first request loads the model)`);
  } catch (error) {
    fail(`Warm-up request to ${model} failed: ${error.message}`);
  }
}

if (ready.length > 0) {
  const response = await fetch(`${config.ollamaUrl}/api/ps`);
  const { models = [] } = await response.json();
  const loadedGb = models.reduce((sum, model) => sum + model.size, 0) / 1024 ** 3;
  ok(`${models.length} model(s) loaded, using ${loadedGb.toFixed(1)} GB in total`);
  if (models.length < ready.length) {
    warn(
      "Fewer models are loaded than needed. Start Ollama with OLLAMA_MAX_LOADED_MODELS=2."
    );
  }
}

// 3. Game data files.
console.log("\nTemp Check data");
try {
  const schedule = await loadSchedule();
  ok(`${schedule.rounds.length} rounds, ${schedule.inputSeconds} s to answer`);
} catch (error) {
  fail(error.message);
}

// 4. Network.
console.log("\nNetwork");
const urls = getJoinUrls();
if (urls.length === 0) {
  fail("No network address found", "Connect to the venue Wi-Fi (or start a hotspot).");
} else {
  for (const url of urls) ok(`Participants can join at ${url}`);
  if (urls.length > 1)
    warn("More than one address found. Set PUBLIC_URL to pick the right one.");
  if (!config.publicUrl) {
    warn("PUBLIC_URL isn't set. If the address changes, people need the new one.");
    warn(
      "Reserve this computer's address in the router (DHCP reservation) before the event."
    );
  }
}

// 5. Is the app already running?
console.log("\nApp");
try {
  const response = await fetch(`http://localhost:${config.port}/api/health`, {
    signal: AbortSignal.timeout(1500),
  });
  const health = await response.json();
  ok(
    `Already running on port ${config.port} (${health.active} active, ${health.queued} queued)`
  );
} catch {
  ok(`Port ${config.port} is free. Start the app with: npm start`);
}

// 6. Things that can't be checked from here.
console.log("\nCheck by hand");
console.log(
  `  · Ollama should be started with OLLAMA_NUM_PARALLEL=${config.maxParallel} (matches MAX_PARALLEL)`
);
console.log(
  "  · And with OLLAMA_KEEP_ALIVE=-1 and OLLAMA_MAX_LOADED_MODELS=2, so both models stay loaded"
);
console.log("  · Sleep and screen-saver off; plugged in; on the same Wi-Fi as the room");

console.log(problems === 0 ? "\nAll good.\n" : `\n${problems} problem(s) to fix.\n`);
process.exit(problems === 0 ? 0 : 1);
