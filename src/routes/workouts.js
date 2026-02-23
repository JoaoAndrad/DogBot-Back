const express = require("express");
const router = express.Router();
const workoutService = require("../services/workoutService");
const { getPrisma } = require("../db");
const logger = require("../lib/logger");

const prisma = getPrisma();

/**
 * POST /api/workouts/log
 * Log a new workout for a user
 */
router.post("/log", async (req, res) => {
  try {
    const { senderNumber, chatId, messageId, note, loggedAt } = req.body;

    if (!senderNumber) {
      return res.status(400).json({
        success: false,
        error: "missing_sender_number",
      });
    }

    const result = await workoutService.logWorkout({
      senderNumber,
      chatId,
      messageId,
      note,
      loggedAt: loggedAt || new Date().toISOString(),
    });

    if (!result.success) {
      const statusCode =
        result.error === "workout_already_logged_today"
          ? 400
          : result.error === "user_not_found"
            ? 404
            : 500;
      return res.status(statusCode).json(result);
    }

    return res.json(result);
  } catch (err) {
    logger.error("[workouts] log error:", err);
    return res.status(500).json({
      success: false,
      error: "internal_error",
      message: "Erro ao registrar treino",
    });
  }
});

/**
 * POST /api/workouts/ranking/:chatId
 * Get monthly ranking for a group (with member filter)
 */
router.post("/ranking/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;
    const { memberIds, month } = req.body;

    if (!memberIds || !Array.isArray(memberIds)) {
      return res.status(400).json({
        success: false,
        error: "missing_member_ids",
      });
    }

    const ranking = await workoutService.getMonthlyRankingForGroup(
      chatId,
      month,
      memberIds,
    );

    return res.json(ranking);
  } catch (err) {
    logger.error("[workouts] ranking error:", err);
    return res.status(500).json({
      success: false,
      error: "internal_error",
    });
  }
});

/**
 * GET /api/workouts/season-history/:chatId
 * Get winners history for the current season
 */
router.get("/season-history/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;
    const { year } = req.query;

    const history = await workoutService.getSeasonWinnersHistory(
      chatId,
      year ? parseInt(year) : undefined,
    );

    return res.json(history);
  } catch (err) {
    logger.error("[workouts] season-history error:", err);
    return res.status(500).json({
      success: false,
      error: "internal_error",
    });
  }
});

/**
 * POST /api/workouts/activate-group
 * Activate workout tracking for a group
 */
router.post("/activate-group", async (req, res) => {
  try {
    const { chatId, activatedBy } = req.body;

    if (!chatId) {
      return res.status(400).json({
        success: false,
        error: "missing_chat_id",
      });
    }

    // Find existing group to preserve activation date
    const existingGroup = await prisma.groupChat.findUnique({ where: { chatId } });
    const activationDate = existingGroup?.workoutActivatedAt ?? new Date();

    // Find or create group chat
    const groupChat = await prisma.groupChat.upsert({
      where: { chatId },
      update: {
        workoutTrackingEnabled: true,
        dogfortEnabled: true,
        workoutNotifications: true,
        currentSeason: new Date().getFullYear(),
        // Only set activatedAt if not previously set
        workoutActivatedAt: activationDate,
      },
      create: {
        chatId,
        workoutTrackingEnabled: true,
        dogfortEnabled: true,
        workoutNotifications: true,
        currentSeason: new Date().getFullYear(),
        workoutActivatedAt: new Date(),
      },
    });

    logger.info(`[workouts] Group ${chatId} activated by ${activatedBy}`);

    return res.json({
      success: true,
      message: "Grupo ativado com sucesso!",
      groupChat,
    });
  } catch (err) {
    logger.error("[workouts] activate-group error:", err);
    return res.status(500).json({
      success: false,
      error: "internal_error",
    });
  }
});

/**
 * GET /api/workouts/stats/:senderNumber
 * Get workout statistics for a user
 */
router.get("/stats/:senderNumber", async (req, res) => {
  try {
    const { senderNumber } = req.params;

    const stats = await workoutService.getUserStats(senderNumber);

    if (!stats) {
      return res.status(404).json({
        success: false,
        error: "user_not_found",
      });
    }

    return res.json(stats);
  } catch (err) {
    logger.error("[workouts] stats error:", err);
    return res.status(500).json({
      success: false,
      error: "internal_error",
    });
  }
});

/**
 * GET /api/workouts/history/:senderNumber
 * Get workout history for a user
 */
router.get("/history/:senderNumber", async (req, res) => {
  try {
    const { senderNumber } = req.params;
    const { startDate, endDate, groupId, limit, offset } = req.query;

    const history = await workoutService.getUserWorkoutHistory(senderNumber, {
      startDate,
      endDate,
      groupId,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });

    return res.json(history);
  } catch (err) {
    logger.error("[workouts] history error:", err);
    return res.status(500).json({
      success: false,
      error: "internal_error",
    });
  }
});

/**
 * POST /api/workouts/process-monthly
 * Manually trigger monthly award processing (admin only)
 */
router.post("/process-monthly", async (req, res) => {
  try {
    // TODO: Add admin authentication check

    const result = await workoutService.processMonthlyAwards();

    return res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    logger.error("[workouts] process-monthly error:", err);
    return res.status(500).json({
      success: false,
      error: "internal_error",
    });
  }
});

/**
 * GET /api/groups/:chatId/settings
 * Get group settings
 */
router.get("/groups/:chatId/settings", async (req, res) => {
  try {
    const { chatId } = req.params;

    const groupChat = await prisma.groupChat.findUnique({
      where: { chatId },
    });

    if (!groupChat) {
      return res.json({
        workoutTrackingEnabled: false,
        dogfortEnabled: false,
        workoutNotifications: false,
      });
    }

    return res.json({
      workoutTrackingEnabled: groupChat.workoutTrackingEnabled,
      dogfortEnabled: groupChat.dogfortEnabled,
      workoutNotifications: groupChat.workoutNotifications,
      currentSeason: groupChat.currentSeason,
      lastMonthProcessed: groupChat.lastMonthProcessed,
      lastRankingUpdate: groupChat.lastRankingUpdate,
    });
  } catch (err) {
    logger.error("[workouts] get group settings error:", err);
    return res.status(500).json({
      success: false,
      error: "internal_error",
    });
  }
});

/**
 * POST /api/groups/:chatId/ranking-updated
 * Update last ranking update timestamp
 */
router.post("/groups/:chatId/ranking-updated", async (req, res) => {
  try {
    const { chatId } = req.params;
    const { timestamp } = req.body;

    await prisma.groupChat.update({
      where: { chatId },
      data: {
        lastRankingUpdate: timestamp ? new Date(timestamp) : new Date(),
      },
    });

    return res.json({ success: true });
  } catch (err) {
    logger.error("[workouts] ranking-updated error:", err);
    return res.status(500).json({
      success: false,
      error: "internal_error",
    });
  }
});

/**
 * POST /api/workouts/set-goal
 * Set annual workout goal for a user
 */
router.post("/set-goal", async (req, res) => {
  try {
    const { senderNumber, annualGoal, isPublic } = req.body;

    if (!senderNumber) {
      return res.status(400).json({
        success: false,
        error: "missing_sender_number",
      });
    }

    if (!annualGoal || annualGoal < 1 || annualGoal > 365) {
      return res.status(400).json({
        success: false,
        error: "invalid_goal",
        message: "Meta deve ser entre 1 e 365",
      });
    }

    const result = await workoutService.setAnnualGoal(
      senderNumber,
      annualGoal,
      isPublic,
    );

    return res.json(result);
  } catch (err) {
    logger.error("[workouts] set-goal error:", err);
    return res.status(500).json({
      success: false,
      error: "internal_error",
    });
  }
});

/**
 * GET /api/workouts/user/:userId/logs
 * Get workout logs for a specific user (for admin management)
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
    logger.error("[workouts] get user logs error:", err);
    return res.status(500).json({
      success: false,
      error: "internal_error",
    });
  }
});

/**
 * DELETE /api/workouts/logs/:logId
 * Delete a specific workout log (for admin corrections)
 */
router.delete("/logs/:logId", async (req, res) => {
  try {
    const { logId } = req.params;

    const result = await workoutService.deleteWorkoutLog(logId);

    return res.json(result);
  } catch (err) {
    logger.error("[workouts] delete log error:", err);
    return res.status(500).json({
      success: false,
      error: "internal_error",
    });
  }
});

/**
 * GET /api/workouts/last-workout/:senderNumber
 * Get last workout for a user, optionally filtered by chatId
 */
router.get("/last-workout/:senderNumber", async (req, res) => {
  try {
    const { senderNumber } = req.params;
    const { chatId } = req.query;

    if (!senderNumber) {
      return res.status(400).json({
        success: false,
        error: "missing_sender_number",
      });
    }

    const lastWorkout = await workoutService.getLastWorkoutForUser(
      senderNumber,
      chatId || null,
    );

    if (!lastWorkout) {
      return res.status(404).json({
        success: false,
        error: "no_workout_found",
      });
    }

    return res.json(lastWorkout);
  } catch (err) {
    logger.error("[workouts] last-workout error:", err);
    return res.status(500).json({
      success: false,
      error: "internal_error",
    });
  }
});

module.exports = router;
