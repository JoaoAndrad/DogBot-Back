// Controller for menu state API
const express = require("express");
const router = express.Router();
const repo = require("../repo/menuStateRepo");

router.use(express.json());

/**
 * POST /api/menu/state - Upsert menu state
 * Body: { userId, flowId, path, history, context, expiresAt }
 */
router.post("/state", async (req, res) => {
  try {
    const { userId, flowId, path, history, context, expiresAt } = req.body;

    if (!userId || !flowId) {
      return res.status(400).json({
        error: "userId and flowId are required",
      });
    }

    const state = await repo.upsert(userId, flowId, {
      path,
      history,
      context,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });

    res.json(state);
  } catch (err) {
    console.log("[menuStateController] POST /state error:", err);
    res.status(500).json({
      error: "Failed to save menu state",
      details: err.message,
    });
  }
});

/**
 * GET /api/menu/state/:userId/:flowId - Get menu state
 */
router.get("/state/:userId/:flowId", async (req, res) => {
  try {
    const { userId, flowId } = req.params;

    const state = await repo.get(userId, flowId);

    if (!state) {
      return res.status(404).json({ error: "Menu state not found" });
    }

    res.json(state);
  } catch (err) {
    console.log("[menuStateController] GET /state error:", err);
    res.status(500).json({
      error: "Failed to get menu state",
      details: err.message,
    });
  }
});

/**
 * DELETE /api/menu/state/:userId/:flowId - Delete menu state
 */
router.delete("/state/:userId/:flowId", async (req, res) => {
  try {
    const { userId, flowId } = req.params;

    await repo.remove(userId, flowId);

    res.json({ success: true });
  } catch (err) {
    console.log("[menuStateController] DELETE /state error:", err);
    res.status(500).json({
      error: "Failed to delete menu state",
      details: err.message,
    });
  }
});

/**
 * GET /api/menu/state/:userId - List all states for user
 */
router.get("/state/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const states = await repo.listByUser(userId);

    res.json(states);
  } catch (err) {
    console.log("[menuStateController] GET /state/:userId error:", err);
    res.status(500).json({
      error: "Failed to list menu states",
      details: err.message,
    });
  }
});

/**
 * POST /api/menu/cleanup - Clean up expired states (admin endpoint)
 */
router.post("/cleanup", async (req, res) => {
  try {
    const result = await repo.cleanupExpired();

    res.json({
      success: true,
      deletedCount: result.count,
    });
  } catch (err) {
    console.log("[menuStateController] POST /cleanup error:", err);
    res.status(500).json({
      error: "Failed to cleanup expired states",
      details: err.message,
    });
  }
});

module.exports = router;
