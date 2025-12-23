// Basic auth middleware for admin routes (reads ADMIN_USER / ADMIN_PASS)
module.exports = function basicAuthMiddleware(req, res, next) {
  const ADMIN_USER = process.env.ADMIN_USER || 'admin';
  const ADMIN_PASS = process.env.ADMIN_PASS || 'changeme';
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Authentication required');
  }
  const creds = Buffer.from(auth.split(' ')[1] || '', 'base64').toString();
  const [user, pass] = creds.split(':');
  if (user === ADMIN_USER && pass === ADMIN_PASS) return next();
  res.set('WWW-Authenticate', 'Basic realm="Admin"');
  return res.status(401).send('Invalid credentials');
};
