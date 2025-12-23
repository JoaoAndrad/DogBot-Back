const express = require("express");
const basicAuth = require("../middleware/adminAuth");
const { recreatePrismaClient } = require("../db");

const router = express.Router();

router.use(basicAuth);

// POST /admin/api/maintenance/recreate-prisma
router.post("/recreate-prisma", async (req, res) => {
  try {
    await recreatePrismaClient();
    res.json({ success: true, message: "Prisma client recriado" });
  } catch (e) {
    console.error("recreate-prisma error", e && e.message ? e.message : e);
    res.status(500).json({ error: "Falha ao recriar Prisma client" });
  }
});

module.exports = router;

// POST /admin/api/maintenance/start-studio
// Spawn `npx prisma studio --port <port> --browser none` in background.
router.post("/start-studio", async (req, res) => {
  try {
    const { port = 5555 } = req.body || {};
    const cp = require("child_process");
    // Use npx to start prisma studio. Run detached so it continues after request.
    const args = [
      "prisma",
      "studio",
      "--port",
      String(port),
      "--browser",
      "none",
    ];
    const child = cp.spawn("npx", args, {
      detached: true,
      stdio: "ignore",
      shell: false,
    });
    // detach and let it run
    child.unref();
    return res.json({
      success: true,
      message: "Prisma Studio started",
      port,
      pid: child.pid,
    });
  } catch (e) {
    console.error("start-studio error", e && e.message ? e.message : e);
    return res.status(500).json({ error: "Failed to start Prisma Studio" });
  }
});
