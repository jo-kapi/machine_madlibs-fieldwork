// Participants' identities, held in memory only. Nothing is written to disk and
// everything is forgotten when the server stops. Pages re-join on load, so a
// restarted server picks people back up.
import { randomBytes } from "node:crypto";
import { InputError } from "./errors.js";

const MAX_SESSIONS = 1000;
const ID_PATTERN = /^[a-f0-9]{32}$/;
const sessions = new Map();

// Removes control characters and extra spaces, and limits the length.
function clean(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// Creates a session, or updates the one with the same id.
export function join({ id, name, pronouns } = {}) {
  const cleanName = clean(name, 40);
  if (!cleanName) throw new InputError("Please enter your name.");

  const sessionId = ID_PATTERN.test(id ?? "") ? id : randomBytes(16).toString("hex");
  if (!sessions.has(sessionId) && sessions.size >= MAX_SESSIONS) {
    throw new InputError("The room is full.", 503);
  }

  const session = { id: sessionId, name: cleanName, pronouns: clean(pronouns, 30) };
  sessions.set(sessionId, session);
  return session;
}

export function getSession(id) {
  return sessions.get(id) ?? null;
}

export function sessionCount() {
  return sessions.size;
}

// For tests.
export function clearSessions() {
  sessions.clear();
}
