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

  // Suppress logging for admin polling endpoints that are frequently
  // requested by the admin UI (these generate noise):
  if (
    method === "GET" &&
    (String(url).startsWith("/admin/db-status") ||
      String(url).startsWith("/admin/logs") ||
      String(url).startsWith("/api/polls"))
  ) {
    return next();
  }

  // Minimal request log: method, url and remote address. Avoid logging
  // headers/body by default to keep logs compact and avoid leaking info.
  const remote =
    req.ip ||
    req.headers["x-forwarded-for"] ||
    req.connection?.remoteAddress ||
    "-";
  console.info(`[REQ] ${method} ${url} from=${remote}`);

  // Hook finish to log response status and duration
  function onFinish() {
    res.removeListener("finish", onFinish);
    res.removeListener("close", onFinish);
    const duration = Date.now() - start;
    const remote =
      req.ip ||
      req.headers["x-forwarded-for"] ||
      req.connection?.remoteAddress ||
      "-";
    console.info(
      `[RES] ${method} ${url} from=${remote} status=${res.statusCode} duration=${duration}ms`
    );
  }

  res.on("finish", onFinish);
  res.on("close", onFinish);

  next();
};
