const express = require("express");
const router = express.Router();
const groupChatRepo = require("../repo/groupChatRepo");
const collaborativeVoteRepo = require("../repo/collaborativeVoteRepo");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Controller for collaborative group listening features
 */

/**
 * POST /api/groups/:chatId/active-listeners
 * Get users in a group who are currently listening to Spotify
 * Body: { memberIds: string[] }
 * Query params:
 * - trackId: optional, filter by specific track
 * - contextId: optional, filter by same context (Jam session)
 */
router.post("/:chatId/active-listeners", async (req, res) => {
  try {
    const { chatId } = req.params;
    const { memberIds } = req.body;
    const { trackId, contextId } = req.query;

    console.log(`[GroupsController] active-listeners request:`, {
      chatId,
      memberCount: memberIds?.length,
      trackId,
      contextId,
    });

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.json({ listeners: [] });
    }

    // Find users by member identifiers
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { sender_number: { in: memberIds } },
          { identifiers: { hasSome: memberIds } },
        ],
      },
      include: {
        spotifyAccounts: true,
      },
    });

    console.log(`[GroupsController] Found users: ${users.length}`);

    // Get real-time playback for each user
    const userSpotifyAdapter = require("../../../services/userSpotifyAdapter");
    const activeListeners = [];

    for (const user of users) {
      if (user.spotifyAccounts.length === 0) continue;

      // Get current playback in real-time
      const playback = await userSpotifyAdapter.getCurrentlyPlaying(user.id);

      if (!playback || !playback.playing || playback.error) {
        console.log(`[GroupsController] ${user.display_name}: not playing`);
        continue;
      }

      // Check filters
      if (trackId && playback.id !== trackId) {
        console.log(`[GroupsController] ${user.display_name}: different track`);
        continue;
      }

      if (contextId && playback.context?.uri !== contextId) {
        console.log(
          `[GroupsController] ${user.display_name}: different context`,
        );
        continue;
      }

      // Find matching identifier
      const matchingId = memberIds.find(
        (mid) => user.sender_number === mid || user.identifiers?.includes(mid),
      );

      console.log(
        `[GroupsController] ${user.display_name}: ACTIVE - ${playback.name}`,
      );

      activeListeners.push({
        userId: user.id,
        identifier: matchingId || user.sender_number,
        displayName: user.display_name || user.push_name,
        currentTrack: {
          trackId: playback.id,
          trackName: playback.name,
          artists: playback.artists,
          albumName: playback.album,
          image: playback.image,
          contextId: playback.context?.uri,
          contextType: playback.context?.type,
          isPlaying: playback.playing,
        },
      });
    }

    console.log(
      `[GroupsController] Active listeners: ${activeListeners.length}`,
    );

    res.json({ listeners: activeListeners });
  } catch (error) {
    console.error("[GroupsController] active-listeners error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/groups/:chatId/vote
 * Create a collaborative vote (skip or add)
 * Body: {
 *   voteType: 'skip' | 'add',
 *   trackId: string,
 *   trackName: string,
 *   trackArtists: string,
 *   initiatorUserId: string,
 *   targetUserIds: string[],
 *   pollId?: string,
 *   threshold?: number (default 0.5)
 * }
 */
router.post("/:chatId/vote", async (req, res) => {
  try {
    const { chatId } = req.params;
    const {
      voteType,
      trackId,
      trackName,
      trackArtists,
      initiatorUserId,
      targetUserIds,
      pollId,
      threshold,
    } = req.body;

    if (!voteType || !initiatorUserId || !targetUserIds) {
      return res.status(400).json({
        error: "voteType, initiatorUserId, and targetUserIds are required",
      });
    }

    // Find or create group
    const group = await groupChatRepo.findOrCreateByChatId(chatId);

    // Create expiration (30 seconds from now)
    const expiresAt = new Date(Date.now() + 30 * 1000);

    const vote = await collaborativeVoteRepo.create({
      groupChatId: group.id,
      pollId,
      voteType,
      trackId,
      trackName,
      trackArtists,
      initiatorUserId,
      targetUserIds,
      threshold: threshold || 0.6,
      expiresAt,
    });

    const stats = await collaborativeVoteRepo.getVoteStats(vote.id);

    res.json({ vote, stats });
  } catch (error) {
    console.error("[GroupsController] vote creation error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/groups/votes/:voteId
 * Get vote details and stats
 */
router.get("/votes/:voteId", async (req, res) => {
  try {
    const { voteId } = req.params;

    const vote = await prisma.collaborativeVote.findUnique({
      where: { id: voteId },
      include: {
        groupChat: {
          include: {
            playlist: true,
          },
        },
      },
    });

    if (!vote) {
      return res.status(404).json({ error: "Vote not found" });
    }

    const stats = await collaborativeVoteRepo.getVoteStats(voteId);

    res.json({ vote, stats });
  } catch (error) {
    console.error("[GroupsController] get vote error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/groups/votes/:voteId/cast
 * Cast a vote
 * Body: { userId: string, isFor: boolean }
 */
router.post("/votes/:voteId/cast", async (req, res) => {
  try {
    const { voteId } = req.params;
    const { userId, isFor, pollId } = req.body;

    if (!userId || typeof isFor !== "boolean") {
      return res.status(400).json({ error: "userId and isFor are required" });
    }

    // Validate user exists and has Spotify connected
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        spotifyAccounts: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.spotifyAccounts || user.spotifyAccounts.length === 0) {
      return res.status(400).json({
        error: "User has no Spotify account connected",
        needsSpotify: true,
      });
    }

    // Get vote to validate pollId if provided
    let vote = await prisma.collaborativeVote.findUnique({
      where: { id: voteId },
    });

    if (!vote) {
      return res.status(404).json({ error: "Vote not found" });
    }

    // Validate pollId matches if provided
    if (pollId && vote.pollId && vote.pollId !== pollId) {
      console.warn(
        `[GroupsController] pollId mismatch: expected ${vote.pollId}, got ${pollId}`,
      );
      return res.status(400).json({ error: "pollId mismatch" });
    }

    // Check if vote is already resolved
    if (vote.status !== "active") {
      console.log(
        `[GroupsController] Vote ${voteId} already resolved with status: ${vote.status}`,
      );
      const stats = await collaborativeVoteRepo.getVoteStats(voteId);
      return res.json({ vote, stats, alreadyResolved: true });
    }

    // Add vote (idempotent - uses Set internally)
    vote = await collaborativeVoteRepo.addVote(voteId, userId, isFor);

    if (!vote) {
      return res.status(404).json({ error: "Vote not found" });
    }

    // Check if resolved - can return null if already resolved or use transaction lock
    const resolvedVote = await collaborativeVoteRepo.checkAndResolve(voteId);
    if (resolvedVote) {
      vote = resolvedVote;

      // Mark as processed to prevent duplicate actions
      if (vote.status !== "active" && !vote.processed) {
        await prisma.collaborativeVote.update({
          where: { id: voteId },
          data: { processed: true },
        });
      }
    }

    const stats = await collaborativeVoteRepo.getVoteStats(voteId);

    res.json({ vote, stats, alreadyResolved: false });
  } catch (error) {
    console.error("[GroupsController] cast vote error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/groups/:chatId
 * Get group info
 */
router.get("/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;
    const group = await groupChatRepo.findByChatId(chatId);

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    res.json({ group });
  } catch (error) {
    console.error("[GroupsController] get group error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/groups/:chatId/playlist
 * Set group playlist
 * Body: { playlistId: string }
 */
router.patch("/:chatId/playlist", async (req, res) => {
  try {
    const { chatId } = req.params;
    const { playlistId } = req.body;

    if (!playlistId) {
      return res.status(400).json({ error: "playlistId is required" });
    }

    const group = await groupChatRepo.updatePlaylist(chatId, playlistId);

    res.json({ group });
  } catch (error) {
    console.error("[GroupsController] update playlist error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/groups/:chatId/playlist/create
 * Create a new Spotify playlist and link to group
 * Body: { userId: string, name: string, description?: string }
 */
router.post("/:chatId/playlist/create", async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userId, name, description } = req.body;

    if (!userId || !name) {
      return res.status(400).json({ error: "userId and name are required" });
    }

    // Find or create group first
    const group = await groupChatRepo.findOrCreateByChatId(chatId);

    // Create playlist on Spotify
    const spotifyService = require("../../../services/spotifyService");
    const createRes = await spotifyService.createSpotifyPlaylist(
      userId,
      name,
      description || `Playlist do grupo ${chatId}`,
      false,
    );

    if (!createRes.success) {
      return res.status(400).json({ error: createRes.error });
    }

    const spotifyPlaylist = createRes.playlist;

    // Get user's account
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        spotifyAccounts: true,
      },
    });

    if (!user || user.spotifyAccounts.length === 0) {
      return res.status(400).json({ error: "User has no Spotify account" });
    }

    const accountId = user.spotifyAccounts[0].id;

    // Save playlist to database
    const dbPlaylist = await prisma.playlist.create({
      data: {
        name: spotifyPlaylist.name,
        description: spotifyPlaylist.description || description,
        spotifyId: spotifyPlaylist.id,
        accountId,
        coverUrl: spotifyPlaylist.images?.[0]?.url,
        isManaged: true,
        meta: {
          spotifyUri: spotifyPlaylist.uri,
          owner: spotifyPlaylist.owner,
        },
      },
    });

    // Link to group
    const updatedGroup = await groupChatRepo.updatePlaylist(
      chatId,
      dbPlaylist.id,
    );

    res.json({
      success: true,
      playlist: dbPlaylist,
      group: updatedGroup,
      spotifyUrl: spotifyPlaylist.external_urls?.spotify,
    });
  } catch (error) {
    console.error("[GroupsController] create playlist error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/groups/:chatId/playlist/link
 * Link an existing Spotify playlist to group
 * Body: { spotifyPlaylistId: string, accountId: string }
 */
router.post("/:chatId/playlist/link", async (req, res) => {
  try {
    const { chatId } = req.params;
    const { spotifyPlaylistId, accountId } = req.body;

    if (!spotifyPlaylistId || !accountId) {
      return res.status(400).json({
        error: "spotifyPlaylistId and accountId are required",
      });
    }

    // Find or create group first
    const group = await groupChatRepo.findOrCreateByChatId(chatId);

    // Get playlist details from Spotify
    const spotifyService = require("../../../services/spotifyService");
    const detailsRes = await spotifyService.getSpotifyPlaylistDetails(
      spotifyPlaylistId,
      accountId,
    );

    if (!detailsRes.success) {
      return res.status(400).json({ error: detailsRes.error });
    }

    const spotifyPlaylist = detailsRes.playlist;

    // Save playlist to database
    const dbPlaylist = await prisma.playlist.create({
      data: {
        name: spotifyPlaylist.name,
        description: spotifyPlaylist.description,
        spotifyId: spotifyPlaylist.id,
        accountId,
        coverUrl: spotifyPlaylist.images?.[0]?.url,
        isManaged: true,
        meta: {
          spotifyUri: spotifyPlaylist.uri,
          owner: spotifyPlaylist.owner,
          tracks: spotifyPlaylist.tracks?.total,
        },
      },
    });

    // Link to group
    const updatedGroup = await groupChatRepo.updatePlaylist(
      chatId,
      dbPlaylist.id,
    );

    res.json({
      success: true,
      playlist: dbPlaylist,
      group: updatedGroup,
      spotifyUrl: spotifyPlaylist.external_urls?.spotify,
    });
  } catch (error) {
    console.error("[GroupsController] link playlist error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/groups/:chatId/playlist/shuffle
 * Body: { playNow?: boolean, limit?: number, deviceId?: string }
 * Triggers playRandomUnique using the playlist's stored Spotify playlist and account
 */
router.post("/:chatId/playlist/shuffle", async (req, res) => {
  try {
    const { chatId } = req.params;
    const { playNow = true, limit = 6, deviceId = null } = req.body || {};

    const group = await groupChatRepo.findByChatId(chatId);
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (
      !group.playlist ||
      !group.playlist.spotifyId ||
      !group.playlist.accountId
    ) {
      return res.status(400).json({
        error: "Group has no linked Spotify playlist or missing account",
      });
    }

    const spotifyShuffle = require("../../../services/spotify_shuffle");

    const result = await spotifyShuffle.playRandomUnique(
      group.playlist.accountId,
      group.playlist.spotifyId,
      {
        playNow,
        limit,
        deviceId,
      },
    );

    return res.json({ success: true, result });
  } catch (error) {
    console.error("[GroupsController] playlist shuffle error:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/spotify/playlists/:playlistId
 * Get playlist details from Spotify
 */
router.get("/playlists/:playlistId", async (req, res) => {
  try {
    const { playlistId } = req.params;

    // Find any user with access to this playlist (or use first available account)
    const users = await prisma.user.findMany({
      where: {
        spotifyAccounts: {
          some: {},
        },
      },
      take: 1,
    });

    if (!users || users.length === 0) {
      return res.status(404).json({ error: "No Spotify accounts available" });
    }

    const userSpotifyAdapter = require("../../../services/userSpotifyAdapter");
    const playlist = await userSpotifyAdapter.getPlaylist(
      users[0].id,
      playlistId,
    );

    if (!playlist) {
      return res.status(404).json({ error: "Playlist not found" });
    }

    res.json({
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      owner: playlist.owner?.display_name,
      tracks: playlist.tracks?.total,
      url: playlist.external_urls?.spotify,
    });
  } catch (error) {
    console.error("[GroupsController] get playlist error:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

/**
 * GET /api/groups/playlists/:playlistId/check-track
 * Query: ?trackId=...&trackName=...
 * Returns whether the playlist already contains the track (exact) or similar titles
 */
router.get("/playlists/:playlistId/check-track", async (req, res) => {
  try {
    const { playlistId } = req.params;
    const { trackId, trackName } = req.query;

    if (!trackId && !trackName) {
      return res.status(400).json({ error: "trackId or trackName required" });
    }

    // Find playlist record in DB
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
    });
    if (!playlist || !playlist.spotifyId) {
      return res
        .status(404)
        .json({ error: "Playlist not found or not linked to Spotify" });
    }

    const spotifyService = require("../../../services/spotifyService");
    const accountId = playlist.accountId;
    const detailsRes = await spotifyService.getSpotifyPlaylistDetails(
      playlist.spotifyId,
      accountId,
    );
    if (!detailsRes || !detailsRes.success || !detailsRes.playlist) {
      return res
        .status(500)
        .json({ error: "Failed to fetch playlist details" });
    }

    const pl = detailsRes.playlist;
    const items = (pl.tracks && pl.tracks.items) || [];

    // Normalization helper
    function normalizeTitle(t) {
      if (!t) return "";
      return t
        .toString()
        .toLowerCase()
        .replace(/\s*\(.*?\)\s*/g, " ") // remove parentheticals
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function tokenSimilarity(a, b) {
      if (!a || !b) return 0;
      const ta = a.split(" ");
      const tb = b.split(" ");
      const sa = new Set(ta.filter(Boolean));
      const sb = new Set(tb.filter(Boolean));
      let inter = 0;
      sa.forEach((x) => {
        if (sb.has(x)) inter++;
      });
      if (inter === 0) return 0;
      return (2 * inter) / (sa.size + sb.size);
    }

    const targetNorm = normalizeTitle(trackName || "");
    let existsExact = false;
    const similar = [];

    for (const it of items) {
      const t = it.track || it;
      if (!t) continue;
      // exact by id
      if (trackId && (t.id === trackId || t.uri === trackId)) {
        existsExact = true;
        break;
      }
      // exact by normalized name
      const nameNorm = normalizeTitle(t.name);
      if (targetNorm && nameNorm && nameNorm === targetNorm) {
        similar.push({
          trackId: t.id,
          name: t.name,
          artists: t.artists,
          score: 1,
        });
        continue;
      }
      // token similarity
      if (targetNorm && nameNorm) {
        const score = tokenSimilarity(targetNorm, nameNorm);
        if (score >= 0.6) {
          similar.push({
            trackId: t.id,
            name: t.name,
            artists: t.artists,
            score,
          });
        }
      }
    }

    res.json({
      existsExact,
      similar,
      playlistTrackCount: pl.tracks?.total || items.length,
    });
  } catch (err) {
    console.error("[GroupsController] check-track error:", err);
    res.status(500).json({ error: err.message });
  }
});
