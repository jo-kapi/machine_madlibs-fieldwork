// Small HTTP helpers: errors safe to show, the host-only guard, server-sent events,
// and the addresses participants use to reach this machine.
import os from "node:os";
import { config } from "./config.js";

// ---------- errors ----------

// An error that carries an HTTP status and a message that is safe to show people.
export class InputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "InputError";
    this.status = status;
  }
}

// ---------- host-only guard ----------

// "::ffff:192.168.1.5" is an IPv4 address written as IPv6.
function plainAddress(address = "") {
  return address.replace(/^::ffff:/, "");
}

function ownAddresses() {
  const addresses = new Set(["127.0.0.1", "::1"]);
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) addresses.add(entry.address);
  }
  return addresses;
}

// True when the connection comes from this machine, including its own browser
// opening the page through the LAN address. It uses the TCP peer address, never a
// header such as X-Forwarded-For, which a client controls.
export function isLocalRequest(req) {
  return ownAddresses().has(plainAddress(req.socket.remoteAddress));
}

// Middleware for the host screen and its controls, so a participant can't take over.
export function localhostOnly(req, res, next) {
  if (isLocalRequest(req)) return next();
  res
    .status(403)
    .type("text")
    .send("The host page is only available on the host machine.");
}

// ---------- server-sent events ----------

// A one-way stream from the server to a browser. Browsers reconnect on their own
// after a drop, so a phone that loses Wi-Fi picks up where it left off.
const HEARTBEAT_MS = 15000;

export function openStream(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.write("retry: 1500\n\n"); // reconnect quickly after a drop

  // A comment line now and then keeps routers from closing an idle connection.
  const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);

  return {
    send(data) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      clearInterval(heartbeat);
    },
  };
}

// ---------- addresses ----------

// Virtual and tunnel interfaces that participants can't reach.
const SKIP_INTERFACE = /^(lo|utun|awdl|llw|bridge|docker|veth|vmnet|vboxnet|anpi)/;

export function getLanAddresses() {
  const addresses = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    if (SKIP_INTERFACE.test(name)) continue;
    for (const entry of entries ?? []) {
      const isLinkLocal = entry.address.startsWith("169.254.");
      if (entry.family === "IPv4" && !entry.internal && !isLinkLocal) {
        addresses.push(entry.address);
      }
    }
  }
  return addresses;
}

// The URLs participants open. PUBLIC_URL, when set, replaces the detected ones.
export function getJoinUrls() {
  if (config.publicUrl) return [config.publicUrl];
  return getLanAddresses().map((address) => `http://${address}:${config.port}`);
}
