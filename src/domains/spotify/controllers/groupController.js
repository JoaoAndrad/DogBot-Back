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
 * GET /api/groups/:chatId/active-listeners
 * Get users in a group who are currently listening to Spotify
 * Query params:
 * - trackId: optional, filter by specific track
 * - contextId: optional, filter by same context (Jam session)
 */
router.get("/:chatId/active-listeners", async (req, res) => {
  try {
    const { chatId } = req.params;
    const { trackId, contextId } = req.query;

    // Get all users who have sent messages in this group
    const groupMessages = await prisma.message.findMany({
      where: {
        chat_id: chatId,
        is_group: true,
      },
      select: {
        from_id: true,
      },
      distinct: ["from_id"],
    });

    const userIdentifiers = groupMessages.map((m) => m.from_id).filter(Boolean);

    if (userIdentifiers.length === 0) {
      return res.json({ listeners: [] });
    }

    // Find users by identifiers
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { sender_number: { in: userIdentifiers } },
          { identifiers: { hasSome: userIdentifiers } },
        ],
      },
      include: {
        spotifyAccounts: {
          include: {
            currentPlayback: true,
          },
        },
      },
    });

    // Filter users who are currently playing
    const activeListeners = users
      .filter((user) => {
        const hasActivePlayback = user.spotifyAccounts.some(
          (account) =>
            account.currentPlayback &&
            account.currentPlayback.isPlaying &&
            (!trackId || account.currentPlayback.trackId === trackId) &&
            (!contextId || account.currentPlayback.contextId === contextId)
        );
        return hasActivePlayback;
      })
      .map((user) => {
        const activeAccount = user.spotifyAccounts.find(
          (account) => account.currentPlayback?.isPlaying
        );
        return {
          userId: user.id,
          identifier: user.sender_number,
          displayName: user.display_name || user.push_name,
          currentTrack: activeAccount?.currentPlayback
            ? {
                trackId: activeAccount.currentPlayback.trackId,
                trackName: activeAccount.currentPlayback.trackName,
                artists: activeAccount.currentPlayback.artists,
                contextId: activeAccount.currentPlayback.contextId,
                contextType: activeAccount.currentPlayback.contextType,
              }
            : null,
        };
      });

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
      threshold: threshold || 0.5,
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
    const { userId, isFor } = req.body;

    if (!userId || typeof isFor !== "boolean") {
      return res.status(400).json({ error: "userId and isFor are required" });
    }

    // Add vote
    let vote = await collaborativeVoteRepo.addVote(voteId, userId, isFor);

    if (!vote) {
      return res.status(404).json({ error: "Vote not found" });
    }

    // Check if resolved
    vote = await collaborativeVoteRepo.checkAndResolve(voteId);

    const stats = await collaborativeVoteRepo.getVoteStats(voteId);

    res.json({ vote, stats });
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

module.exports = router;
