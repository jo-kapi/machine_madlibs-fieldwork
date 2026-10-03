import express from "express";
import { createApiRouter } from "./api.js";
import { Game } from "./game.js";
import { Gallery } from "./gallery.js";
import { loadSchedule } from "./schedule.js";
import { sampleWords } from "./sampling.js";
import { getSession } from "./sessions.js";
import { localhostOnly } from "./guards.js";
import { hostDir, publicDir } from "./paths.js";

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

  // The host page (the projector view) is only served to this machine.
  app.use("/host", localhostOnly, express.static(hostDir));

  app.get("/temp", (req, res) => res.redirect("/activity_03.html"));
  app.use(express.static(publicDir));

  return app;
}
