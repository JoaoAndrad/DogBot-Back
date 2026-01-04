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

// GET /api/spotify/playlists/managed - List managed playlists
router.get("/playlists/managed", async (req, res) => {
  try {
    const prisma = require("../db").getPrisma();
    const playlists = await prisma.playlist.findMany({
      where: { isManaged: true },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { entries: true } } },
    });

    const result = playlists.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      spotifyId: p.spotifyId,
      coverUrl: p.coverUrl,
      isManaged: p.isManaged,
      syncedAt: p.syncedAt,
      trackCount:
        (p._count && p._count.entries) ||
        (p.meta && (p.meta.tracks || p.meta.tracks_total)) ||
        0,
      meta: p.meta || {},
    }));

    res.json({ playlists: result });
  } catch (err) {
    console.error("[Spotify] playlists/managed error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/spotify/top - Top tracks by playCount (TrackStat)
router.get("/top", async (req, res) => {
  try {
    const prisma = require("../db").getPrisma();
    const limit = Math.min(50, Number(req.query.limit || 10));
    const stats = await prisma.trackStat.findMany({
      orderBy: { playCount: "desc" },
      take: limit,
      include: { track: true },
    });

    const result = stats.map((s) => ({
      trackId: s.trackId,
      playCount: s.playCount,
      lastPlayedAt: s.lastPlayedAt,
      avgRating: s.avgRating,
      ratingCount: s.ratingCount,
      track: s.track
        ? {
            id: s.track.id,
            name: s.track.name,
            artists: s.track.artists,
            album: s.track.album,
            imageUrl: s.track.imageUrl,
          }
        : null,
    }));

    res.json({ top: result });
  } catch (err) {
    console.error("[Spotify] top error:", err);
    res.status(500).json({ error: err.message });
  }
});

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
// POST /api/spotify/skip - Skip to next track
router.post("/skip", async (req, res) => {
  try {
    const spotifyService = require("../services/spotifyService");
    const result = await spotifyService.skipTrack();

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
