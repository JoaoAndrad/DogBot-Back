const clients = new Set();
let keepAliveInterval = null;

function sendComment(res) {
  try {
    res.write(`: keep-alive\n\n`);
  } catch (e) {
    // ignore
  }
}

function startKeepAlive() {
  if (keepAliveInterval) return;
  keepAliveInterval = setInterval(() => {
    for (const res of clients) sendComment(res);
  }, 25000);
}

function stopKeepAlive() {
  if (keepAliveInterval && clients.size === 0) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

function subscribe(req, res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders && res.flushHeaders();

  // send an initial comment
  res.write(`: connected\n\n`);

  clients.add(res);
  startKeepAlive();

  req.on("close", () => {
    clients.delete(res);
    stopKeepAlive();
  });
}

function sendEvent(eventName, data) {
  const payload = typeof data === "string" ? data : JSON.stringify(data || {});
  const message = `event: ${eventName}\n` + `data: ${payload}\n\n`;
  for (const res of clients) {
    try {
      res.write(message);
    } catch (e) {
      // ignore write errors
    }
  }
}

module.exports = { subscribe, sendEvent };
