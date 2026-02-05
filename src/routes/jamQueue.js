const express = require("express");
const router = express.Router();
const jamQueueService = require("../services/jamQueueService");
const logger = require("../lib/logger");

/**
 * POST /api/jam/:jamId/queue
 * Add track to queue
 */
router.post("/:jamId/queue", async (req, res, next) => {
  try {
    const { jamId } = req.params;
    const { userId, trackData, skipVoting } = req.body;

    if (!userId || !trackData) {
      return res.status(400).json({
        error: "MISSING_FIELDS",
        message: "userId and trackData are required",
      });
    }

    const result = await jamQueueService.addToQueue(jamId, userId, trackData, skipVoting);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (err) {
    logger.error("[JamQueue Routes] Error adding to queue:", err);
    next(err);
  }
});

/**
 * POST /api/jam/queue/:queueEntryId/vote
 * Vote on queue entry
 */
router.post("/queue/:queueEntryId/vote", async (req, res, next) => {
  try {
    const { queueEntryId } = req.params;
    const { userId, isFor } = req.body;

    if (!userId || isFor === undefined) {
      return res.status(400).json({
        error: "MISSING_FIELDS",
        message: "userId and isFor are required",
      });
    }

    const result = await jamQueueService.voteOnQueueEntry(
      queueEntryId,
      userId,
      isFor,
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (err) {
    logger.error("[JamQueue Routes] Error voting on queue entry:", err);
    next(err);
  }
});

/**
 * GET /api/jam/:jamId/queue
 * Get jam queue
 */
router.get("/:jamId/queue", async (req, res, next) => {
  try {
    const { jamId } = req.params;

    const result = await jamQueueService.getQueue(jamId);

    res.json(result);
  } catch (err) {
    logger.error("[JamQueue Routes] Error getting queue:", err);
    next(err);
  }
});

/**
 * GET /api/jam/:jamId/queue/next
 * Get next track from queue
 */
router.get("/:jamId/queue/next", async (req, res, next) => {
  try {
    const { jamId } = req.params;

    const result = await jamQueueService.getNextTrack(jamId);

    res.json(result);
  } catch (err) {
    logger.error("[JamQueue Routes] Error getting next track:", err);
    next(err);
  }
});

/**
 * POST /api/jam/queue/:queueEntryId/played
 * Mark track as played
 */
router.post("/queue/:queueEntryId/played", async (req, res, next) => {
  try {
    const { queueEntryId } = req.params;

    const result = await jamQueueService.markAsPlayed(queueEntryId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (err) {
    logger.error("[JamQueue Routes] Error marking as played:", err);
    next(err);
  }
});

/**
 * DELETE /api/jam/:jamId/queue
 * Clear queue (host only)
 */
router.delete("/:jamId/queue", async (req, res, next) => {
  try {
    const { jamId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: "MISSING_FIELDS",
        message: "userId is required",
      });
    }

    const result = await jamQueueService.clearQueue(jamId, userId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (err) {
    logger.error("[JamQueue Routes] Error clearing queue:", err);
    next(err);
  }
});

module.exports = router;
