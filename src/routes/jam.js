const express = require("express");
const router = express.Router();
const jamService = require("../services/jamService");
const jamQueueRoutes = require("./jamQueue");
const logger = require("../lib/logger");

// Mount queue routes
router.use("/", jamQueueRoutes);

/**
 * POST /api/jam/create
 * Create a new jam session
 * Body: { userId, chatId? }
 */
router.post("/create", async (req, res) => {
  try {
    const { userId, chatId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "MISSING_USER_ID",
        message: "userId é obrigatório",
      });
    }

    const result = await jamService.createJam(userId, chatId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err) {
    logger.error("[JamRoutes] Error creating jam:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/jam/active
 * Get all active jam sessions
 * Query: chatId? (optional filter)
 */
router.get("/active", async (req, res) => {
  try {
    const { chatId } = req.query;

    const result = await jamService.getActiveJams(chatId);

    return res.json(result);
  } catch (err) {
    logger.error("[JamRoutes] Error getting active jams:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
      jams: [],
    });
  }
});

/**
 * GET /api/jam/:jamId
 * Get jam session details
 */
router.get("/:jamId", async (req, res) => {
  try {
    const { jamId } = req.params;

    const result = await jamService.getJamById(jamId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    return res.json(result);
  } catch (err) {
    logger.error("[JamRoutes] Error getting jam:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/jam/:jamId/join
 * Join a jam session
 * Body: { userId }
 */
router.post("/:jamId/join", async (req, res) => {
  try {
    const { jamId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "MISSING_USER_ID",
        message: "userId é obrigatório",
      });
    }

    const result = await jamService.joinJam(jamId, userId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err) {
    logger.error("[JamRoutes] Error joining jam:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/jam/:jamId/leave
 * Leave a jam session
 * Body: { userId }
 */
router.post("/:jamId/leave", async (req, res) => {
  try {
    const { jamId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "MISSING_USER_ID",
        message: "userId é obrigatório",
      });
    }

    const result = await jamService.leaveJam(jamId, userId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err) {
    logger.error("[JamRoutes] Error leaving jam:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * DELETE /api/jam/:jamId
 * End a jam session (host only)
 * Body: { userId }
 */
router.delete("/:jamId", async (req, res) => {
  try {
    const { jamId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "MISSING_USER_ID",
        message: "userId é obrigatório",
      });
    }

    const result = await jamService.endJam(jamId, userId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err) {
    logger.error("[JamRoutes] Error ending jam:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/jam/:jamId/sync
 * Force sync all listeners to current jam state
 * Body: { userId } (must be host)
 */
router.post("/:jamId/sync", async (req, res) => {
  try {
    const { jamId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "MISSING_USER_ID",
        message: "userId é obrigatório",
      });
    }

    // Verify user is the host
    const jamResult = await jamService.getJamById(jamId);
    if (!jamResult.success) {
      return res.status(404).json(jamResult);
    }

    if (jamResult.jam.hostUserId !== userId) {
      return res.status(403).json({
        success: false,
        error: "NOT_HOST",
        message: "Apenas o host pode forçar sincronização",
      });
    }

    const result = await jamService.syncAllListeners(jamId);

    return res.json(result);
  } catch (err) {
    logger.error("[JamRoutes] Error syncing listeners:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/jam/:jamId/skip
 * Skip jam host to next track and sync listeners
 * Body: { userId? }
 */
router.post("/:jamId/skip", async (req, res) => {
  try {
    const { jamId } = req.params;
    // optional userId for auditing
    const { userId } = req.body || {};

    const result = await jamService.skipJam(jamId);
    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json({ success: true });
  } catch (err) {
    logger.error("[JamRoutes] Error skipping jam:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/jam/user/:userId/status
 * Get user's current jam status (hosting or listening)
 */
router.get("/user/:userId/status", async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await jamService.getUserActiveJam(userId);

    return res.json(result);
  } catch (err) {
    logger.error("[JamRoutes] Error getting user jam status:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/jam/:jamId/transfer-host
 * Transfer jam host control to another listener
 * Body: { currentHostUserId, newHostUserId }
 */
router.post("/:jamId/transfer-host", async (req, res) => {
  try {
    const { jamId } = req.params;
    const { currentHostUserId, newHostUserId } = req.body;

    if (!currentHostUserId || !newHostUserId) {
      return res.status(400).json({
        success: false,
        error: "MISSING_PARAMETERS",
        message: "currentHostUserId e newHostUserId são obrigatórios",
      });
    }

    const result = await jamService.transferHost(
      jamId,
      currentHostUserId,
      newHostUserId,
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err) {
    logger.error("[JamRoutes] Error transferring host:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * PATCH /api/jam/:jamId
 * Update jam session properties (e.g., jamType)
 * Body: { jamType? }
 */
router.patch("/:jamId", async (req, res) => {
  try {
    const { jamId } = req.params;
    const { jamType } = req.body;

    if (!jamType) {
      return res.status(400).json({
        success: false,
        error: "MISSING_FIELDS",
        message: "jamType é obrigatório",
      });
    }

    if (!["classic", "collaborative"].includes(jamType)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_JAM_TYPE",
        message: "jamType deve ser 'classic' ou 'collaborative'",
      });
    }

    const updatedJam = await jamService.updateJamType(jamId, jamType);

    if (!updatedJam.success) {
      return res.status(400).json(updatedJam);
    }

    return res.json(updatedJam);
  } catch (err) {
    logger.error("[JamRoutes] Error updating jam:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/jam/cleanup-inactive
 * Close jams that have been inactive for more than 30 minutes
 * Internal endpoint - should be called periodically
 */
router.post("/cleanup-inactive", async (req, res) => {
  try {
    const result = await jamService.closeInactiveJams();
    return res.json(result);
  } catch (err) {
    logger.error("[JamRoutes] Error cleaning up inactive jams:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;
