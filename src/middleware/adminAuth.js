// Admin auth middleware: accepts Basic auth (ADMIN_USER/ADMIN_PASS)
// OR an internal secret via header `X-Internal-Secret` (process.env.INTERNAL_SECRET).
module.exports = function adminAuthMiddleware(req, res, next) {
  const ADMIN_USER = process.env.ADMIN_USER || "admin";
  const ADMIN_PASS = process.env.ADMIN_PASS || "changeme";
  const INTERNAL_SECRET =
    process.env.INTERNAL_SECRET || process.env.ADMIN_INTERNAL_SECRET;

  // Allow X-Internal-Secret header or query param if it matches configured secret
  const headerSecret =
    (req.get && (req.get("x-internal-secret") || req.get("x-bot-secret"))) ||
    "";
  const querySecret =
    (req.query && (req.query.internal_secret || req.query.internalSecret)) ||
    "";
  const providedSecret = (headerSecret || querySecret || "").toString().trim();
  if (INTERNAL_SECRET && providedSecret && providedSecret === INTERNAL_SECRET) {
    return next();
  }

  // Fallback to Basic auth
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Basic ")) {
    res.set("WWW-Authenticate", 'Basic realm="Admin"');
    return res.status(401).send("Authentication required");
  }
  const creds = Buffer.from(auth.split(" ")[1] || "", "base64").toString();
  const [user, pass] = creds.split(":");
  if (user === ADMIN_USER && pass === ADMIN_PASS) return next();
  res.set("WWW-Authenticate", 'Basic realm="Admin"');
  return res.status(401).send("Invalid credentials");
};
