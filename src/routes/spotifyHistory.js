const express = require("express");
const router = express.Router();
const historyController = require("../domains/spotify/controllers/spotifyHistoryController");
const trackNoteController = require("../domains/spotify/controllers/trackNoteController");
const path = require("path");
const fs = require("fs");
const fetch = require("node-fetch");

// Directory to cache preview MP3s
const PREVIEW_CACHE_DIR = path.resolve(
  __dirname,
  "../../../tmp/spotify-previews"
);
const PREVIEW_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Ensure cache dir exists
try {
  fs.mkdirSync(PREVIEW_CACHE_DIR, { recursive: true });
} catch (e) {
  console.warn("Could not create preview cache dir", e && e.message);
}

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
    // Only return playlists that are managed and linked to an active group
    const playlists = await prisma.playlist.findMany({
      where: {
        isManaged: true,
        groupChats: { some: { isActive: true } },
      },
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

// GET /api/spotify/preview?trackId=...&userId=...&accountId=...
router.get("/preview", async (req, res) => {
  try {
    const { trackId, userId, accountId } = req.query;
    if (!trackId) return res.status(400).json({ error: "trackId is required" });

    const spotifyService = require("../services/spotifyService");
    const prisma = spotifyService.prisma;

    // Determine which spotify account to use for authenticated calls
    let acct = null;
    if (accountId) {
      acct = await prisma.spotifyAccount.findUnique({
        where: { id: accountId },
      });
    } else if (userId) {
      acct = await prisma.spotifyAccount.findFirst({ where: { userId } });
    } else {
      // fallback: pick any account (prefer one with tokens)
      acct = await prisma.spotifyAccount.findFirst();
    }

    if (!acct || !acct.id) {
      return res
        .status(400)
        .json({ error: "No spotify account available to fetch preview" });
    }

    const cacheFile = path.join(PREVIEW_CACHE_DIR, `${trackId}.mp3`);
    // Serve cached file if fresh
    try {
      const st = await fs.promises.stat(cacheFile).catch(() => null);
      if (st && Date.now() - st.mtimeMs < PREVIEW_CACHE_TTL) {
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Cache-Control", "public, max-age=86400");
        return fs.createReadStream(cacheFile).pipe(res);
      }
    } catch (e) {
      // ignore cache errors
    }

    // Fetch track metadata to get preview_url
    const trackEndpoint = `https://api.spotify.com/v1/tracks/${encodeURIComponent(
      trackId
    )}`;
    const trackRes = await spotifyService.spotifyFetch(acct.id, trackEndpoint);
    if (!trackRes || !trackRes.ok) {
      const status = (trackRes && trackRes.status) || 502;
      const text =
        trackRes && trackRes.text
          ? await trackRes.text().catch(() => null)
          : null;
      return res
        .status(status)
        .json({ error: "Failed to fetch track metadata", details: text });
    }

    const trackJson = await trackRes.json();
    const previewUrl =
      trackJson && (trackJson.preview_url || trackJson.previewUrl);
    if (!previewUrl)
      return res.status(404).json({ error: "preview_unavailable" });

    // Download preview and write to cache file
    const previewResp = await fetch(previewUrl);
    if (!previewResp || !previewResp.ok) {
      return res
        .status(previewResp ? previewResp.status : 502)
        .json({ error: "failed_to_download_preview" });
    }

    // Stream to temp file and then pipe to response
    const tmpFile = cacheFile + ".tmp";
    const dest = fs.createWriteStream(tmpFile);
    await new Promise((resolve, reject) => {
      previewResp.body.pipe(dest);
      previewResp.body.on("error", (err) => reject(err));
      dest.on("finish", resolve);
      dest.on("error", (err) => reject(err));
    });

    // Move tmp file to cache atomically
    await fs.promises.rename(tmpFile, cacheFile);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return fs.createReadStream(cacheFile).pipe(res);
  } catch (err) {
    console.error(
      "/api/spotify/preview error:",
      err && err.stack ? err.stack : err
    );
    return res
      .status(500)
      .json({ error: err && err.message ? err.message : String(err) });
  }
});

module.exports = router;
