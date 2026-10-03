// Middleware that limits a route to the machine running the server.
// The host page and its controls use this so a participant can't take over.
import os from "node:os";

// "::ffff:192.168.1.5" is an IPv4 address in IPv6 clothing.
function normalise(address = "") {
  return address.replace(/^::ffff:/, "");
}

function ownAddresses() {
  const addresses = new Set(["127.0.0.1", "::1"]);
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) addresses.add(entry.address);
  }
  return addresses;
}

// True when the connection comes from this machine, including when its own
// browser opens the page through the machine's LAN address. The check uses the
// TCP peer address, never headers such as X-Forwarded-For, which clients control.
export function isLocalRequest(req) {
  return ownAddresses().has(normalise(req.socket.remoteAddress));
}

export function localhostOnly(req, res, next) {
  if (isLocalRequest(req)) return next();
  res
    .status(403)
    .type("text")
    .send("The host page is only available on the host machine.");
}
