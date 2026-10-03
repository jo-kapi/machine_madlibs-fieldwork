// Server-Sent Events: a one-way stream from the server to a browser.
// Browsers reconnect on their own after a drop, so a phone that loses Wi-Fi
// picks up where it left off.

const HEARTBEAT_MS = 15000;

export function openStream(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  // Tell the browser to retry quickly after a drop.
  res.write("retry: 1500\n\n");

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
