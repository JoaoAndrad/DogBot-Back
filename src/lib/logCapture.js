// Simple in-memory log capture. Wraps console methods and stores recent entries.
const MAX_ENTRIES = Number(process.env.LOG_CAPTURE_MAX || 1000);
const store = [];

function pushEntry(level, args) {
  try {
    const text = args
      .map((a) => {
        if (typeof a === "string") return a;
        try {
          return JSON.stringify(a);
        } catch (e) {
          return String(a);
        }
      })
      .join(" ");
    store.push({ ts: new Date().toISOString(), level, text });
    if (store.length > MAX_ENTRIES) store.splice(0, store.length - MAX_ENTRIES);
  } catch (e) {
    // ignore capture errors
  }
}

// Wrap console methods
["log", "info", "warn", "error", "debug"].forEach((method) => {
  const orig = console[method] && console[method].bind(console);
  console[method] = (...args) => {
    try {
      pushEntry(method, args);
    } catch (e) {}
    if (orig) orig(...args);
  };
});

function getRecent(limit = 200) {
  const l = Number(limit) || 200;
  return store.slice(-Math.min(store.length, l));
}

module.exports = { getRecent };
