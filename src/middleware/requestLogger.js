// Simple request logging middleware. Masks sensitive headers and logs timing.
const util = require("util");

function mask(v) {
  if (!v) return v;
  try {
    const s = String(v);
    if (s.length <= 8) return "****";
    return s.slice(0, 4) + "..." + s.slice(-4);
  } catch (e) {
    return "****";
  }
}

function safeStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    return util.inspect(obj, { depth: 2 });
  }
}

module.exports = function requestLogger(req, res, next) {
  const start = Date.now();
  const method = req.method;
  const url = req.originalUrl || req.url;

  // Suppress logging for high-frequency message ingestion endpoint
  // to avoid noisy logs in production.
  if (method === "POST" && String(url).startsWith("/api/messages")) {
    return next();
  }

  // copy and mask headers we don't want to leak
  const headers = Object.assign({}, req.headers || {});
  if (headers.authorization) headers.authorization = "[masked]";
  if (headers["x-internal-secret"])
    headers["x-internal-secret"] = mask(headers["x-internal-secret"]);
  if (headers["x-bot-secret"])
    headers["x-bot-secret"] = mask(headers["x-bot-secret"]);

  const bodyPreview = (() => {
    if (!req.body) return null;
    try {
      const json =
        typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      // avoid logging huge payloads
      const s = safeStringify(json);
      return s.length > 1000 ? s.slice(0, 1000) + "...[truncated]" : s;
    } catch (e) {
      try {
        const s = String(req.body);
        return s.length > 1000 ? s.slice(0, 1000) + "...[truncated]" : s;
      } catch (e2) {
        return null;
      }
    }
  })();

  console.info(
    `[REQ] ${method} ${url} headers=${safeStringify(
      headers
    )} body=${bodyPreview}`
  );

  // Hook finish to log response status and duration
  function onFinish() {
    res.removeListener("finish", onFinish);
    res.removeListener("close", onFinish);
    const duration = Date.now() - start;
    console.info(
      `[RES] ${method} ${url} status=${res.statusCode} duration=${duration}ms`
    );
  }

  res.on("finish", onFinish);
  res.on("close", onFinish);

  next();
};
