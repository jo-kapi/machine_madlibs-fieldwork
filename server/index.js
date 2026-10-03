import { config, modelsInUse } from "./config.js";
import { createApp } from "./app.js";
import { getJoinUrls } from "./network.js";
import { listModels, hasModel, rawChat } from "./ollama.js";

// Reports whether Ollama and each model are ready. Returns the models that are.
async function printOllamaStatus() {
  const installed = await listModels();
  if (installed === null) {
    console.warn(
      `\n! Can't reach Ollama at ${config.ollamaUrl}. Start it with: ollama serve`
    );
    return [];
  }

  const ready = [];
  for (const { name, usedFor } of modelsInUse()) {
    if (hasModel(installed, name)) {
      console.log(`Model ready: ${name} (${usedFor})`);
      ready.push(name);
    } else {
      console.warn(`! Model "${name}" isn't installed. Run: ollama pull ${name}`);
    }
  }
  return ready;
}

// The first request to a model loads it into memory, which can take several
// seconds. Doing that now means the first participants don't wait for it.
async function warmUp(models) {
  if (models.length === 0) return;
  console.log("\nWarming up the models…");
  await Promise.all(
    models.map((model) =>
      rawChat({
        model,
        system: "Reply with one word.",
        user: "Hello",
        options: { num_predict: 1 },
        timeoutMs: 180000,
      }).catch((error) => console.warn(`! Couldn't warm up ${model}: ${error.message}`))
    )
  );
  console.log("Ready.");
}

const server = createApp().listen(config.port, "0.0.0.0", async () => {
  const urls = getJoinUrls();
  console.log("\nMachine Madlibs · field:work");
  console.log(`\nHost screen (this computer only): http://localhost:${config.port}/host`);
  console.log(`Activities on this computer:      http://localhost:${config.port}`);

  if (urls.length === 0) {
    console.log("\nNo network address found. Connect to Wi-Fi so others can join.");
  } else {
    console.log(`Participants join at:              ${urls.join("   ")}`);
  }

  console.log();
  await warmUp(await printOllamaStatus());
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `\nPort ${config.port} is already in use. Stop the other program or use another port: PORT=3001 npm start`
    );
  } else {
    console.error(error);
  }
  process.exit(1);
});
