// Ensure Prisma client is generated at startup in environments without a build step
try {
  const { execSync } = require("child_process");
  console.log(
    "Running `npx prisma generate` to ensure Prisma client is available"
  );
  // run quietly but stream output to logs for visibility
  execSync("npx prisma generate", { stdio: "inherit" });
  console.log("`prisma generate` completed");
} catch (e) {
  console.warn(
    "`prisma generate` failed or is unavailable in this environment:",
    e && e.message
  );
  // continue startup; downstream code will error with a clear message if Prisma models are missing
}

const app = require("./app");
const jamService = require("./services/jamService");
const logger = require("./lib/logger");

const PORT = process.env.PORT ? Number(process.env.PORT) : 80;
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(
    `Server listening on ${HOST}:${PORT} (NODE_ENV=${
      process.env.NODE_ENV || "development"
    })`
  );
  
  // Schedule periodic cleanup of inactive jams (every 5 minutes)
  const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds
  setInterval(async () => {
    try {
      const result = await jamService.closeInactiveJams();
      if (result.success && result.closed > 0) {
        logger.info(`[JamCleanup] Closed ${result.closed} inactive jam(s)`);
      }
    } catch (err) {
      logger.error("[JamCleanup] Error during cleanup:", err);
    }
  }, CLEANUP_INTERVAL);
  
  logger.info("[JamCleanup] Periodic jam cleanup scheduled (every 5 minutes)");
});
