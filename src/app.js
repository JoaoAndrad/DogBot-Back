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
const adminAuth = require("./middleware/adminAuth");

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
// Serve admin static SPA assets with no-cache to ensure updated scripts are fetched
app.use(
  "/admin/static",
  express.static(path.join(__dirname, "..", "admin-ui"), {
    maxAge: 0,
    etag: false,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "no-store, must-revalidate");
    },
  })
);

// Serve a top-level admin logo at /admin/logo.svg for AdminJS or direct requests
app.get("/admin/logo.svg", (req, res) => {
  const logoPath = path.join(__dirname, "..", "admin-ui", "logo.svg");
  return res.sendFile(logoPath, (err) => {
    if (err) {
      res.status(err.status || 500).end();
    }
  });
});

// Mount API
app.use("/api", apiRouter);

// Admin users API (protected by basic auth middleware inside router)
try {
  app.use("/admin/api/users", require("./routes/adminUsers"));
} catch (e) {
  console.warn(
    "Failed to mount admin users routes:",
    e && e.message ? e.message : e
  );
}

// Admin maintenance endpoints (recreate Prisma client, etc.)
try {
  app.use("/admin/api/maintenance", require("./routes/adminMaintenance"));
} catch (e) {
  console.warn(
    "Failed to mount admin maintenance routes:",
    e && e.message ? e.message : e
  );
}

// Spotify OAuth routes (minimal)
try {
  app.use("/spotify", require("./routes/spotifyAuth"));
} catch (e) {
  console.warn(
    "Failed to mount spotify routes:",
    e && e.message ? e.message : e
  );
}

// Start Spotify monitor on app startup (uses internal adapter)
try {
  const UserSpotifyAdapter = require("./services/userSpotifyAdapter");
  const SpotifyMonitor = require("./services/spotifyMonitor");
  const monitor = new SpotifyMonitor({
    userSpotifyAPI: UserSpotifyAdapter,
    intervalMs: Number(process.env.SPOTIFY_MONITOR_INTERVAL_MS) || 30000,
    concurrency: Number(process.env.SPOTIFY_MONITOR_CONCURRENCY) || 5,
  });
  // start monitoring in background
  monitor.start();
  // attach monitor to app for introspection (e.g., routes can access)
  app.locals.spotifyMonitor = monitor;
  console.log("[App] SpotifyMonitor initialized and started");
} catch (e) {
  console.warn(
    "Failed to initialize SpotifyMonitor:",
    e && e.message ? e.message : e
  );
}

app.get("/connected", async (req, res) => {
  try {
    await testConnection();
    return res.json({ message: "Conectado com sucesso" });
  } catch (err) {
    console.log("DB connection failed:", err.message || err);
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

// Serve admin config JS with internal secret injected (protected by admin auth)
app.get("/admin/config.js", adminAuth, (req, res) => {
  const secret =
    process.env.INTERNAL_SECRET ||
    process.env.ADMIN_INTERNAL_SECRET ||
    process.env.INTERNAL_API_SECRET ||
    "";
  res.type("application/javascript");
  res.send(`window.__ADMIN_INTERNAL_SECRET__ = ${JSON.stringify(secret)};`);
});

module.exports = app;
