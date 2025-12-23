// Middleware to protect modifying API calls via header secrets
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
    return res.status(403).json({ error: "server_misconfigured_no_secrets" });
  }

  if (!headerSecret)
    return res.status(401).json({ error: "missing_secret_header" });

  const valid = secrets.some((s) => s && s === headerSecret);
  if (!valid) return res.status(403).json({ error: "invalid_secret" });

  return next();
};
