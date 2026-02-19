const express = require("express");
const basicAuth = require("../middleware/adminAuth");
const workoutService = require("../services/workoutService");
const logger = require("../lib/logger");

const router = express.Router();

router.use(basicAuth);

/**
 * GET /admin/api/workouts/user/:userId/logs
 * Get workout logs for a specific user
 */
router.get("/user/:userId/logs", async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit || "30", 10);

    const logs = await workoutService.getUserWorkoutLogs(userId, limit);

    return res.json({
      success: true,
      logs,
    });
  } catch (err) {
    logger.error("[admin-workouts] get user logs error:", err);
    return res.status(500).json({
      success: false,
      error: "internal_error",
      message: err.message,
    });
  }
});

/**
 * DELETE /admin/api/workouts/logs/:logId
 * Delete a specific workout log
 */
router.delete("/logs/:logId", async (req, res) => {
  try {
    const { logId } = req.params;

    const result = await workoutService.deleteWorkoutLog(logId);

    return res.json(result);
  } catch (err) {
    logger.error("[admin-workouts] delete log error:", err);
    return res.status(500).json({
      success: false,
      error: "internal_error",
      message: err.message,
    });
  }
});

module.exports = router;
