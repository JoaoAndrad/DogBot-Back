const express = require("express");
const basicAuth = require("../middleware/adminAuth");
const { recreatePrismaClient, getPrisma } = require("../db");

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

// GET /admin/api/maintenance/prisma-info
// Returns diagnostic info about the Prisma client (keys, presence of models)
router.get("/prisma-info", async (req, res) => {
  try {
    const prisma = getPrisma();
    const keys = prisma ? Object.keys(prisma) : [];
    return res.json({
      hasClient: !!prisma,
      keys,
      hasUserModel: !!(prisma && prisma.user),
    });
  } catch (e) {
    console.error("prisma-info error", e && e.message ? e.message : e);
    return res.status(500).json({ error: "Failed to get prisma info" });
  }
});

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

// POST /admin/api/maintenance/generate-prisma
router.post("/generate-prisma", async (req, res) => {
  try {
    const cp = require("child_process");
    const path = require("path");
    const backendRoot = path.join(__dirname, "..", "..");
    // run npx prisma generate in backend root
    const cmd = "npx prisma generate";
    cp.exec(
      cmd,
      { cwd: backendRoot, env: process.env },
      async (err, stdout, stderr) => {
        if (err) {
          console.error("prisma generate failed", err, stderr);
          return res.status(500).json({
            error: "prisma generate failed",
            details: stderr || String(err),
          });
        }
        try {
          // recreate client after generate
          await recreatePrismaClient();
          return res.json({ success: true, output: stdout });
        } catch (e) {
          console.error(
            "recreate after generate failed",
            e && e.message ? e.message : e
          );
          return res.status(500).json({
            error: "recreate failed",
            details: e && e.message ? e.message : String(e),
          });
        }
      }
    );
  } catch (e) {
    console.error("generate-prisma error", e && e.message ? e.message : e);
    return res.status(500).json({ error: "Failed to run prisma generate" });
  }
});

// POST /admin/api/maintenance/spotify-check
// Body: { userId: '<uuid or whatsapp identifier>' }
router.post("/spotify-check", async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "missing_userId" });

    const userSpotifyAdapter = require("../services/userSpotifyAdapter");
    const spotifyService = require("../services/spotifyService");
    const userRepo = require("../domains/users/repo/userRepo");

    let resolvedUserId = userId;
    // if not UUID, try resolve via identifiers/base
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        userId
      );
    if (!isUUID) {
      let user = await userRepo.findByIdentifierExact(userId);
      if (!user) {
        const base = userRepo.extractBaseNumber(userId);
        user = await userRepo.findByBaseNumber(base);
      }
      if (!user) return res.status(404).json({ error: "user_not_found" });
      resolvedUserId = user.id;
    }

    // find account for user
    const prisma = spotifyService.prisma;
    const account = await prisma.spotifyAccount.findFirst({
      where: { userId: resolvedUserId },
    });
    if (!account)
      return res.status(404).json({ error: "spotify_account_not_found" });

    // call fetchAndPersistUser directly
    const result = await spotifyService.fetchAndPersistUser({
      accountId: account.id,
      userId: resolvedUserId,
      userSpotifyAPI: userSpotifyAdapter,
    });

    return res.json({ success: true, accountId: account.id, result });
  } catch (err) {
    console.error(
      "spotify-check error",
      err && err.message ? err.message : err
    );
    return res
      .status(500)
      .json({ error: "spotify_check_failed", details: err && err.message });
  }
});
