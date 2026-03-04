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

// GET /api/admin/spotify/sessions - list current playback sessions (admin)
router.get("/sessions", adminAuth, async (req, res) => {
  try {
    const db = require("../db").getPrisma();

    // Only include the related SpotifyAccount (which can include a User)
    // CurrentPlayback does not have direct `user` or `track` relations.
    const sessions = await db.currentPlayback.findMany({
      orderBy: { startedAt: "desc" },
      take: 50,
      include: { account: { include: { user: true } } },
    });

    // Fetch track metadata in batch for any trackIds present
    const trackIds = Array.from(
      new Set(sessions.map((s) => s.trackId).filter(Boolean)),
    );
    const tracks =
      trackIds.length > 0
        ? await db.track.findMany({ where: { id: { in: trackIds } } })
        : [];
    const trackMap = {};
    for (const t of tracks) trackMap[t.id] = t;

    const result = sessions.map((s) => {
      const acct = s.account || null;
      const user = acct && acct.user ? acct.user : null;
      const track = s.trackId ? trackMap[s.trackId] : null;

      // try to extract listenedMs from metadata if available
      let listenedMs = 0;
      try {
        if (s.metadata && typeof s.metadata === "object") {
          listenedMs = s.metadata.listenedMs || s.metadata.listened_ms || 0;
        }
      } catch (e) {
        listenedMs = 0;
      }

      return {
        id: s.accountId,
        accountId: s.accountId,
        userId: acct ? acct.userId || null : null,
        userName: user
          ? user.display_name || user.push_name || user.displayName || null
          : null,
        userAvatar:
          user && user.metadata && user.metadata.avatarUrl
            ? user.metadata.avatarUrl
            : null,
        trackId: s.trackId,
        trackName: track ? track.name : null,
        trackImage: track ? track.imageUrl : null,
        startedAt: s.startedAt,
        listenedMs,
      };
    });

    res.json({ sessions: result });
  } catch (err) {
    console.error("[adminSpotify] sessions error:", err);
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
          accountId,
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
          accountId,
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

// POST /playlists/:id/unlink -> remove playlist linkage from any group
router.post("/playlists/:id/unlink", adminAuth, async (req, res) => {
  try {
    const db = require("../db").getPrisma();
    const { id } = req.params;

    // Find any group linked to this playlist
    const group = await db.groupChat.findFirst({ where: { playlistId: id } });
    if (!group) return res.status(404).json({ error: "playlist_not_linked" });

    const updated = await db.groupChat.update({
      where: { id: group.id },
      data: { playlistId: null },
      include: { playlist: true },
    });

    return res.json({ success: true, group: updated });
  } catch (err) {
    console.error("[adminSpotify] unlink playlist error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /spotify/accounts/capacity -> show how many accounts are in each app
router.get("/accounts/capacity", adminAuth, async (req, res) => {
  try {
    const db = require("../db").getPrisma();
    const config = require("../config");
    const apps = config.spotifyApps;

    const counts = await db.spotifyAccount.groupBy({
      by: ["appIndex"],
      _count: { id: true },
    });
    const countMap = {};
    for (const row of counts) countMap[row.appIndex] = row._count.id;

    const capacity = apps.map((app) => ({
      appIndex: app.index,
      clientId: app.clientId.substring(0, 8) + "...", // partial for display
      used: countMap[app.index] || 0,
      max: 5,
    }));

    return res.json({ capacity });
  } catch (err) {
    console.error("[adminSpotify] capacity error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /spotify/accounts/:accountId/app -> move account to a different Spotify app
// Deletes existing tokens (user must re-authenticate with the new app)
router.patch("/accounts/:accountId/app", adminAuth, async (req, res) => {
  try {
    const db = require("../db").getPrisma();
    const config = require("../config");
    const { accountId } = req.params;
    const { appIndex } = req.body;

    if (appIndex == null || typeof appIndex !== "number") {
      return res.status(400).json({ error: "appIndex (number) is required" });
    }

    const apps = config.spotifyApps;
    if (!apps[appIndex]) {
      return res
        .status(400)
        .json({
          error: `appIndex ${appIndex} does not exist (${apps.length} apps configured)`,
        });
    }

    // Check capacity on target app
    const countInTarget = await db.spotifyAccount.count({
      where: { appIndex },
    });
    if (countInTarget >= 5) {
      return res
        .status(409)
        .json({ error: `App ${appIndex} is already at capacity (5/5)` });
    }

    const existing = await db.spotifyAccount.findUnique({
      where: { id: accountId },
    });
    if (!existing) {
      return res.status(404).json({ error: "SpotifyAccount not found" });
    }

    // Delete all tokens — they are bound to the old app's client_id
    await db.spotifyToken.deleteMany({ where: { accountId } });

    // Move to new app
    const updated = await db.spotifyAccount.update({
      where: { id: accountId },
      data: { appIndex },
      include: {
        user: {
          select: {
            id: true,
            display_name: true,
            push_name: true,
            sender_number: true,
          },
        },
      },
    });

    return res.json({
      message: "Account moved. Tokens deleted — user must re-authenticate.",
      account: updated,
      reAuthRequired: true,
    });
  } catch (err) {
    console.error("[adminSpotify] move account error:", err);
    return res.status(500).json({ error: err.message });
  }
});
