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

// Track notes: simplified endpoint (auto-resolves trackId)
// POST /api/spotify/notes
router.post("/notes", trackNoteController.createNoteSimple);

// Track notes: history + latest + create
// POST /api/spotify/tracks/:trackId/notes
router.post("/tracks/:trackId/notes", trackNoteController.createNote);
// GET /api/spotify/tracks/:trackId/notes
router.get("/tracks/:trackId/notes", trackNoteController.listNotes);
// GET /api/spotify/tracks/:trackId/notes/latest
router.get("/tracks/:trackId/notes/latest", trackNoteController.getLatestNotes);
// GET /api/spotify/tracks/:trackId/stats
router.get("/tracks/:trackId/stats", trackNoteController.getTrackStats);

// Playback control
// POST /api/spotify/skip - Skip to next track for a user
router.post("/skip", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const spotifyService = require("../services/spotifyService");
    const result = await spotifyService.skipTrack(userId);

    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error("[Spotify] skip error:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/spotify/playlists/:playlistId/tracks - Add track to playlist
router.post("/playlists/:playlistId/tracks", async (req, res) => {
  try {
    const { playlistId } = req.params;
    const { trackUri, accountId } = req.body;

    if (!trackUri || !accountId) {
      return res
        .status(400)
        .json({ error: "trackUri and accountId are required" });
    }

    const spotifyService = require("../services/spotifyService");
    const result = await spotifyService.addTrackToPlaylist(
      playlistId,
      trackUri,
      accountId
    );

    if (result.success) {
      res.json({ success: true, data: result.data });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error("[Spotify] add track error:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
