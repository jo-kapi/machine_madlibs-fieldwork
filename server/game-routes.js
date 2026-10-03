// Routes for the Temp Check game.
//   /api/temp/*  players (any device on the network)
//   /api/host/*  the host only: refused unless the request comes from this machine
import { Router } from "express";
import { InputError } from "./errors.js";
import { getSession } from "./sessions.js";
import { localhostOnly } from "./guards.js";
import { openStream } from "./sse.js";
import { getJoinUrls } from "./network.js";

function requireSession(id) {
  if (typeof id !== "string" || !getSession(id)) {
    throw new InputError("Join first.", 401);
  }
  return id;
}

export function createGameRouter({ game, gallery }) {
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
    // Connecting triggers an update, which sends this player the current state,
    // so a phone that dropped and came back resumes where the game is now.
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

  // ----- host: gallery of images players sent to the screen -----

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
