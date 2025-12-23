// Express error handler
module.exports = function errorHandler(err, req, res, next) {
  console.error(err && err.stack ? err.stack : err);
  res.status(500).json({ error: "internal_server_error" });
};
