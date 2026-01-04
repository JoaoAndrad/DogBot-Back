const express = require("express");
const router = express.Router();
const adminAuth = require("../middleware/adminAuth");
const spotifyService = require("../services/spotifyService");
const sseHub = require("../lib/sseHub");

// Admin-only Spotify status endpoint
router.get("/status", adminAuth, async (req, res) => {
  try {
    const db = require("../db").getPrisma();

    // token status: any spotify account exists
    const spotifyAccounts = await db.spotifyAccount.count();

    // requests today (track notes)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const requestsToday = await db.trackNote.count({
      where: { createdAt: { gte: startOfDay } },
    });

    // active DJ sessions (current playbacks)
    const activeSessions = await db.currentPlayback.count();

    // managed playlists
    const managedPlaylists = await db.playlist.count({
      where: { isManaged: true },
    });

    res.json({
      tokenConnected: spotifyAccounts > 0,
      requestsToday,
      activeSessions,
      managedPlaylists,
    });
  } catch (err) {
    console.error("[adminSpotify] status error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// Admin endpoints to control collaborative votes
// POST /votes/:voteId/cancel  -> force cancel a vote
// POST /votes/:voteId/force   -> force pass a vote and execute action

router.post("/votes/:voteId/cancel", adminAuth, async (req, res) => {
  try {
    const db = require("../db").getPrisma();
    const { voteId } = req.params;

    const vote = await db.collaborativeVote.findUnique({
      where: { id: voteId },
    });
    if (!vote) return res.status(404).json({ error: "vote_not_found" });

    if (vote.status !== "active")
      return res
        .status(400)
        .json({ error: "vote_not_active", status: vote.status });

    await db.collaborativeVote.update({
      where: { id: voteId },
      data: { status: "failed", resolvedAt: new Date() },
    });

    // notify SSE subscribers
    try {
      sseHub.sendEvent("vote_cancelled", { id: voteId, status: "failed" });
    } catch (e) {
      console.error("[adminSpotify] sse send error:", e);
    }

    return res.json({ success: true, id: voteId });
  } catch (err) {
    console.error("[adminSpotify] cancel vote error:", err);
    return res.status(500).json({ error: err.message });
  }
});

router.post("/votes/:voteId/force", adminAuth, async (req, res) => {
  try {
    const db = require("../db").getPrisma();
    const { voteId } = req.params;

    const vote = await db.collaborativeVote.findUnique({
      where: { id: voteId },
      include: { groupChat: true },
    });
    if (!vote) return res.status(404).json({ error: "vote_not_found" });

    if (vote.status !== "active")
      return res
        .status(400)
        .json({ error: "vote_not_active", status: vote.status });

    // Mark as passed
    await db.collaborativeVote.update({
      where: { id: voteId },
      data: { status: "passed", resolvedAt: new Date() },
    });

    // Execute action depending on voteType
    let actionResult = { executed: false };
    if (vote.voteType === "skip") {
      const result = await spotifyService.skipTrack();
      actionResult = { executed: true, type: "skip", result };
    } else if (vote.voteType === "add" && vote.trackId) {
      // Try to find playlist spotifyId from groupChat -> playlistId
      let playlist = null;
      if (vote.groupChat && vote.groupChat.playlistId) {
        playlist = await db.playlist.findUnique({
          where: { id: vote.groupChat.playlistId },
        });
      }

      // Determine accountId to use: prefer playlist.accountId, fallback to any spotify account
      let accountId =
        playlist && playlist.accountId ? playlist.accountId : null;
      if (!accountId) {
        const anyUser = await db.user.findFirst({
          where: { spotifyAccounts: { some: {} } },
          include: { spotifyAccounts: { take: 1 } },
        });
        if (
          anyUser &&
          anyUser.spotifyAccounts &&
          anyUser.spotifyAccounts.length > 0
        ) {
          accountId = anyUser.spotifyAccounts[0].id;
        }
      }

      if (playlist && playlist.spotifyId && accountId) {
        const resAdd = await spotifyService.addTrackToPlaylist(
          playlist.spotifyId,
          vote.trackId,
          accountId
        );
        actionResult = {
          executed: true,
          type: "add",
          result: resAdd,
          playlistId: playlist.id,
        };
      } else {
        actionResult = { executed: false, reason: "no_playlist_or_account" };
      }
    }

    // notify SSE subscribers
    try {
      sseHub.sendEvent("vote_forced", {
        id: voteId,
        status: "passed",
        action: actionResult,
      });
    } catch (e) {
      console.error("[adminSpotify] sse send error:", e);
    }

    return res.json({ success: true, id: voteId, action: actionResult });
  } catch (err) {
    console.error("[adminSpotify] force vote error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// SSE endpoint for admin UI to receive real-time events
router.get("/events", adminAuth, (req, res) => {
  try {
    sseHub.subscribe(req, res);
  } catch (err) {
    console.error("[adminSpotify] sse subscribe error:", err);
    res.status(500).end();
  }
});

// POST /playlists/:id/sync -> trigger sync to external Spotify playlist
router.post("/playlists/:id/sync", adminAuth, async (req, res) => {
  const db = require("../db").getPrisma();
  const { id } = req.params;
  try {
    const playlist = await db.playlist.findUnique({ where: { id } });
    if (!playlist) return res.status(404).json({ error: "playlist_not_found" });
    if (!playlist.spotifyId)
      return res.status(400).json({ error: "playlist_has_no_spotifyId" });

    // create sync log
    const log = await db.playlistSyncLog.create({
      data: {
        playlistId: playlist.id,
        attemptedBy: null,
        startedAt: new Date(),
      },
    });

    // fetch entries
    const entries = await db.playlistEntry.findMany({
      where: { playlistId: playlist.id },
      include: { track: true },
      orderBy: { addedAt: "asc" },
      take: 500,
    });

    // determine accountId to use
    let accountId = playlist.accountId || null;
    if (!accountId) {
      const anyUser = await db.user.findFirst({
        where: { spotifyAccounts: { some: {} } },
        include: { spotifyAccounts: { take: 1 } },
      });
      if (
        anyUser &&
        anyUser.spotifyAccounts &&
        anyUser.spotifyAccounts.length > 0
      )
        accountId = anyUser.spotifyAccounts[0].id;
    }

    if (!accountId) {
      await db.playlistSyncLog.update({
        where: { id: log.id },
        data: {
          finishedAt: new Date(),
          success: false,
          result: { error: "no_account_available" },
        },
      });
      return res.status(500).json({ error: "no_spotify_account_available" });
    }

    const results = [];
    for (const e of entries) {
      const trackId = e.trackId || (e.track && e.track.id);
      if (!trackId) {
        results.push({ id: e.id, ok: false, reason: "no_track_id" });
        continue;
      }
      try {
        const r = await spotifyService.addTrackToPlaylist(
          playlist.spotifyId,
          trackId,
          accountId
        );
        results.push({
          id: e.id,
          trackId,
          ok: r && r.success === true,
          result: r,
        });
      } catch (err) {
        results.push({
          id: e.id,
          trackId,
          ok: false,
          error: String(err && err.message ? err.message : err),
        });
      }
    }

    const success = results.every((r) => r.ok === true);
    await db.playlistSyncLog.update({
      where: { id: log.id },
      data: { finishedAt: new Date(), success, result: results },
    });

    // update playlist syncedAt
    await db.playlist.update({
      where: { id: playlist.id },
      data: { syncedAt: new Date() },
    });

    // notify SSE subscribers
    try {
      sseHub.sendEvent("playlist_sync", { playlistId: playlist.id, success });
    } catch (e) {
      console.error("[adminSpotify] sse send error:", e);
    }

    return res.json({ success: true, playlistId: playlist.id, results });
  } catch (err) {
    console.error("[adminSpotify] playlist sync error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /playlists/:id/settings -> return playlist meta/settings
router.get("/playlists/:id/settings", adminAuth, async (req, res) => {
  const db = require("../db").getPrisma();
  const { id } = req.params;
  try {
    const playlist = await db.playlist.findUnique({ where: { id } });
    if (!playlist) return res.status(404).json({ error: "playlist_not_found" });
    return res.json({
      id: playlist.id,
      name: playlist.name,
      meta: playlist.meta || {},
    });
  } catch (err) {
    console.error("[adminSpotify] playlist settings error:", err);
    return res.status(500).json({ error: err.message });
  }
});
