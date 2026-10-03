// JSON API used by the activity pages. Browsers talk only to these routes;
// Ollama itself is never exposed.
import express, { Router } from "express";
import { config, modelsInUse } from "./config.js";
import { PROMPTS } from "./prompts.js";
import { writer, poet, color } from "./activities.js";
import { limiter, listModels, hasModel } from "./ollama.js";
import { join, getSession } from "./sessions.js";
import { InputError } from "./errors.js";
import { createGameRouter } from "./game-routes.js";

// Aborts when the client disconnects before the reply is sent, so queued
// work for a closed tab is dropped.
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

  // Images are large, so this route is registered before the small default body limit.
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

  // What the "peek at the system prompt" panel shows. For Temp Check it also
  // includes the temperature currently in play.
  router.get("/prompts/:activity", (req, res) => {
    const prompts = PROMPTS[req.params.activity];
    if (!prompts) return res.status(404).json({ error: "Unknown activity." });
    const live = req.params.activity === "temp" ? game.liveSampling() : undefined;
    const model = req.params.activity === "temp" ? config.tempModel : config.model;
    res.json({ model, prompts, live });
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

  // Express 5 forwards errors from async handlers here.
  // Our own errors (InputError, OllamaError) and body-parser errors carry a
  // status and a message that is safe to show.
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.name === "AbortError") return; // the client left
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: "Something went wrong." });
  });

  return router;
}
