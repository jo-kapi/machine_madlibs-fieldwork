// Finds the addresses participants can use to reach this machine.
import os from "node:os";
import { config } from "./config.js";

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

// URLs participants should open. PUBLIC_URL, if set, replaces the detected ones.
export function getJoinUrls() {
  if (config.publicUrl) return [config.publicUrl];
  return getLanAddresses().map((address) => `http://${address}:${config.port}`);
}
