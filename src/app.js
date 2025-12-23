const express = require("express");
const path = require("path");
// initialize log capture early so other modules' logs are recorded
try {
  require("./lib/logCapture");
} catch (e) {
  console.warn(
    "logCapture failed to initialize:",
    e && e.message ? e.message : e
  );
}

const { testConnection } = require("./db");
const { buildAdminRouter } = require("./admin");
const apiRouter = require("./routes/api");

const app = express();
app.use(express.json());
// Request logging (logs incoming requests and response status/duration)
try {
  const requestLogger = require("./middleware/requestLogger");
  app.use(requestLogger);
} catch (e) {
  console.warn(
    "Request logger failed to load:",
    e && e.message ? e.message : e
  );
}

// Serve admin static SPA assets
app.use(
  "/admin/static",
  express.static(path.join(__dirname, "..", "admin-ui"))
);

// Mount API
app.use("/api", apiRouter);

app.get("/connected", async (req, res) => {
  try {
    await testConnection();
    return res.json({ message: "Conectado com sucesso" });
  } catch (err) {
    console.error("DB connection failed:", err.message || err);
    return res
      .status(500)
      .json({ error: "Falha ao conectar ao banco", details: err.message });
  }
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

// Mount admin UI at /admin
try {
  const adminRouter = buildAdminRouter();
  app.use("/admin", adminRouter);
} catch (err) {
  console.warn(
    "AdminJS failed to mount:",
    err && err.message ? err.message : err
  );
}

module.exports = app;
