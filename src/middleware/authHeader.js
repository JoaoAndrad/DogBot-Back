// Middleware to protect modifying API calls via header secrets
const logger = require("../lib/logger");

module.exports = function authHeader(req, res, next) {
  // Only enforce for modifying HTTP methods
  const method = (req.method || "").toUpperCase();
  if (!["POST", "PUT", "DELETE", "PATCH"].includes(method)) return next();

  const headerSecret = (
    req.get("x-internal-secret") ||
    req.get("x-bot-secret") ||
    ""
  ).trim();
  const secrets = [];
  if (process.env.POLL_SHARED_SECRET)
    secrets.push(process.env.POLL_SHARED_SECRET);
  if (process.env.INTERNAL_API_SECRET)
    secrets.push(process.env.INTERNAL_API_SECRET);
  if (process.env.BOT_SECRET) secrets.push(process.env.BOT_SECRET);

  if (secrets.length === 0) {
    // No secret configured: deny to be safe
    logger.error("[authHeader] No secrets configured in environment");
    return res.status(403).json({ error: "server_misconfigured_no_secrets" });
  }

  if (!headerSecret) {
    logger.warn("[authHeader] Missing secret header in request");
    return res.status(401).json({ error: "missing_secret_header" });
  }

  const valid = secrets.some((s) => s && s === headerSecret);
  if (!valid) {
    logger.warn(
      `[authHeader] Invalid secret. Received: ${headerSecret.slice(
        0,
        10
      )}..., Expected one of ${secrets.length} configured secrets`
    );
    return res.status(403).json({ error: "invalid_secret" });
  }

  return next();
};
