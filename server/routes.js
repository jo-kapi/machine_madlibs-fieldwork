// The Express app and every route: the activity API, the Temp Check game, and the host
// screen. Browsers talk only to these routes; Ollama itself is never exposed.
import express, { Router } from "express";
import { config, modelsInUse, hostDir, publicDir } from "./config.js";
import { PROMPTS } from "./prompts.js";
import { writer, poet, color, parseCraziness, withCraziness } from "./activities.js";
import { limiter, listModels, hasModel } from "./ollama.js";
import { join, getSession, Gallery } from "./people.js";
import { Game } from "./game.js";
import { loadSchedule, sampleWords } from "./game-rules.js";
import { InputError, localhostOnly, openStream, getJoinUrls } from "./web.js";

// `game` can be replaced, which is how tests run without a model.
export function createApp({ game, gallery = new Gallery() } = {}) {
  game ??= new Game({
    loadSchedule,
    sampler: sampleWords,
    getName: (id) => getSession(id)?.name ?? "Player",
  });

  const app = express();
  app.disable("x-powered-by");

  app.use("/api", createApiRouter({ game, gallery }));

  // The projector screen is only served to this machine.
  app.use("/host", localhostOnly, express.static(hostDir));

  app.get("/temp", (req, res) => res.redirect("/activity_03.html"));
  app.use(express.static(publicDir));

  return app;
}

// ---------- the JSON API ----------

// Aborts when the client disconnects before the reply is sent, so queued work for a
// closed tab is dropped.
function abortOnDisconnect(res) {
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) controller.abort();
  });
  return controller.signal;
}

// Wraps an activity function as a POST handler.
function activityRoute(activity) {
  return async (req, res) => {
    const signal = abortOnDisconnect(res);
    res.json(await activity({ ...req.body, signal }));
  };
}

export function createApiRouter({ game, gallery }) {
  const router = Router();

  // Images are large, so this route comes before the small default body limit.
  router.post("/gallery", express.json({ limit: "8mb" }), (req, res) => {
    const session = getSession(req.body?.id);
    if (!session) throw new InputError("Join first.", 401);
    gallery.add(session, req.body.image);
    res.json({ ok: true });
  });

  router.use(express.json({ limit: "16kb" }));

  // Creates or refreshes a participant's identity (name and optional pronouns).
  router.post("/join", (req, res) => res.json(join(req.body)));

  router.post("/writer", activityRoute(writer));
  router.post("/poet", activityRoute(poet));
  router.post("/color", activityRoute(color));

  router.use(createGameRouter({ game, gallery }));

  // What the "peek at the system prompt" sheet shows. Temp Check adds the temperature
  // in play. Pages with a Craziness slider send its position (?craziness=0.7), so the
  // temperatures shown are the real ones.
  router.get("/prompts/:activity", (req, res) => {
    const activity = req.params.activity;
    let prompts = PROMPTS[activity];
    if (!prompts) return res.status(404).json({ error: "Unknown activity." });

    const adjusted = activity === "writer" || activity === "poet";
    if (adjusted) {
      const { craziness } = req.query;
      const slider = parseCraziness(
        craziness === undefined ? undefined : Number(craziness)
      );
      prompts = Object.fromEntries(
        Object.entries(prompts).map(([key, prompt]) => [
          key,
          { ...prompt, options: withCraziness(prompt.options, slider) },
        ])
      );
    }
    const live = activity === "temp" ? game.liveSampling() : undefined;
    const model = activity === "temp" ? config.tempModel : config.model;
    res.json({ model, prompts, live, adjusted });
  });

  // Settings the pages need.
  router.get("/config", (req, res) => {
    res.json({ googleFormUrl: config.googleFormUrl, version: config.version });
  });

  router.get("/health", async (req, res) => {
    const installed = await listModels();
    const models = modelsInUse().map((model) => ({
      name: model.name,
      usedFor: model.usedFor,
      installed: installed !== null && hasModel(installed, model.name),
    }));
    res.json({
      ollama: installed !== null,
      models,
      allModelsInstalled: models.every((model) => model.installed),
      active: limiter.active,
      queued: limiter.queued,
    });
  });

  router.use((req, res) => res.status(404).json({ error: "Not found." }));

  // Express 5 forwards errors from async handlers here. Our own errors (InputError,
  // OllamaError) and body-parser errors carry a status and a message safe to show.
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.name === "AbortError") return; // the client left
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: "Something went wrong." });
  });

  return router;
}

// ---------- Temp Check ----------
//   /api/temp/*  players, on any device on the network
//   /api/host/*  the host only: refused unless the request comes from this machine

function requireSession(id) {
  if (typeof id !== "string" || !getSession(id)) {
    throw new InputError("Join first.", 401);
  }
  return id;
}

function createGameRouter({ game, gallery }) {
  const router = Router();
  const playerStreams = new Set(); // { id, stream }
  const hostStreams = new Set();

  // Whenever the game changes, everyone connected gets their own fresh view.
  game.subscribe(() => {
    for (const { id, stream } of playerStreams) stream.send(game.playerView(id));
    if (hostStreams.size > 0) {
      const view = game.hostView();
      for (const stream of hostStreams) stream.send(view);
    }
  });

  // ----- players -----

  router.get("/temp/events", (req, res) => {
    const id = requireSession(req.query.id);
    const stream = openStream(res);
    const client = { id, stream };
    playerStreams.add(client);
    // Connecting triggers an update that sends this player the current state, so a
    // phone that dropped and came back resumes where the game is now.
    game.connect(id);

    res.on("close", () => {
      playerStreams.delete(client);
      stream.close();
      game.disconnect(id);
    });
  });

  router.post("/temp/answer", (req, res) => {
    const id = requireSession(req.body?.id);
    res.json({ word: game.answer(id, req.body.word) });
  });

  router.post("/temp/vote", (req, res) => {
    const id = requireSession(req.body?.id);
    game.vote(id, req.body.direction);
    res.json({ ok: true });
  });

  // ----- host -----

  router.use("/host", localhostOnly);

  router.get("/host/events", (req, res) => {
    const stream = openStream(res);
    hostStreams.add(stream);
    stream.send(game.hostView());
    res.on("close", () => {
      hostStreams.delete(stream);
      stream.close();
    });
  });

  router.post("/host/command", async (req, res) => {
    await game.command(req.body ?? {});
    res.json({ ok: true });
  });

  // The images players sent to the screen.
  router.get("/host/gallery/events", (req, res) => {
    const stream = openStream(res);
    const send = () => stream.send(gallery.list());
    const unsubscribe = gallery.subscribe(send);
    send();
    res.on("close", () => {
      unsubscribe();
      stream.close();
    });
  });

  router.get("/host/gallery/image/:id", (req, res) => {
    const item = gallery.get(req.params.id);
    if (!item) return res.status(404).json({ error: "Not found." });
    res.type("png").set("Cache-Control", "private, max-age=3600").send(item.png);
  });

  router.delete("/host/gallery/:id", (req, res) => {
    res.json({ removed: gallery.remove(req.params.id) });
  });

  // The addresses players type in to join.
  router.get("/host/join", (req, res) => {
    res.json({ urls: getJoinUrls() });
  });

  return router;
}
