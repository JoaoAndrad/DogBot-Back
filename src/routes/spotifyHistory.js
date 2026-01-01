const express = require("express");
const router = express.Router();
const historyController = require("../domains/spotify/controllers/spotifyHistoryController");

/**
 * Spotify history and stats routes
 * Base path: /api/spotify
 */

// GET /api/spotify/history - Get user listening history
router.get("/history", historyController.getHistory);

// GET /api/spotify/summary - Get monthly or overall summary
router.get("/summary", historyController.getSummary);

// GET /api/spotify/stats - Get user stats (top tracks, recent plays)
router.get("/stats", historyController.getStats);

// GET /api/spotify/current - Get currently playing track
router.get("/current", historyController.getCurrent);

module.exports = router;
