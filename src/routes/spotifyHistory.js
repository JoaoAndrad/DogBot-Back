const express = require("express");
const router = express.Router();
const historyController = require("../domains/spotify/controllers/spotifyHistoryController");
const trackNoteController = require("../domains/spotify/controllers/trackNoteController");

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

// Track notes: history + latest + create
// POST /api/spotify/tracks/:trackId/notes
router.post("/tracks/:trackId/notes", trackNoteController.createNote);
// GET /api/spotify/tracks/:trackId/notes
router.get("/tracks/:trackId/notes", trackNoteController.listNotes);
// GET /api/spotify/tracks/:trackId/notes/latest
router.get("/tracks/:trackId/notes/latest", trackNoteController.getLatestNotes);
// GET /api/spotify/tracks/:trackId/stats
router.get("/tracks/:trackId/stats", trackNoteController.getTrackStats);

module.exports = router;
