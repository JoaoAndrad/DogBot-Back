const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Repository for CollaborativeVote operations
 */
module.exports = {
  /**
   * Create a new collaborative vote
   */
  async create(data) {
    // Convert trackArtists array to string if needed
    const trackArtists = Array.isArray(data.trackArtists)
      ? data.trackArtists.join(", ")
      : data.trackArtists;

    return await prisma.collaborativeVote.create({
      data: {
        groupChatId: data.groupChatId,
        pollId: data.pollId,
        voteType: data.voteType,
        trackId: data.trackId,
        trackName: data.trackName,
        trackArtists,
        initiatorUserId: data.initiatorUserId,
        targetUserIds: data.targetUserIds || [],
        votesFor: data.votesFor || [data.initiatorUserId], // Initiator auto-votes yes (doesn't vote manually)
        votesAgainst: data.votesAgainst || [],
        threshold: data.threshold || 0.5,
        expiresAt: data.expiresAt,
      },
    });
  },

  /**
   * Find active vote by poll ID
   */
  async findByPollId(pollId) {
    return await prisma.collaborativeVote.findFirst({
      where: {
        pollId,
        status: "active",
      },
      include: {
        groupChat: {
          include: {
            playlist: true,
          },
        },
      },
    });
  },

  /**
   * Find active votes in a group
   */
  async findActiveByGroup(groupChatId) {
    return await prisma.collaborativeVote.findMany({
      where: {
        groupChatId,
        status: "active",
      },
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Find active vote in a group for a specific track (for deduplication)
   */
  async findActiveByGroupAndTrack(groupChatId, trackId) {
    return await prisma.collaborativeVote.findFirst({
      where: {
        groupChatId,
        trackId,
        status: "active",
      },
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Add vote to a collaborative vote
   */
  async addVote(voteId, userId, isFor) {
    const vote = await prisma.collaborativeVote.findUnique({
      where: { id: voteId },
    });

    if (!vote) return null;

    const votesFor = vote.votesFor || [];
    const votesAgainst = vote.votesAgainst || [];

    // Remove from opposite array if exists
    const updatedFor = isFor
      ? [...new Set([...votesFor, userId])]
      : votesFor.filter((id) => id !== userId);
    const updatedAgainst = !isFor
      ? [...new Set([...votesAgainst, userId])]
      : votesAgainst.filter((id) => id !== userId);

    return await prisma.collaborativeVote.update({
      where: { id: voteId },
      data: {
        votesFor: updatedFor,
        votesAgainst: updatedAgainst,
      },
    });
  },

  /**
   * Check if vote has reached threshold and resolve
   */
  async checkAndResolve(voteId) {
    const vote = await prisma.collaborativeVote.findUnique({
      where: { id: voteId },
    });

    if (!vote || vote.status !== "active") return null;

    const targetUserIds = vote.targetUserIds || [];
    const votesFor = vote.votesFor || [];
    const votesAgainst = vote.votesAgainst || [];
    const totalVotes = votesFor.length + votesAgainst.length;
    const totalEligible = targetUserIds.length;

    // Check if everyone voted or if enough voted for/against
    const percentFor = totalEligible > 0 ? votesFor.length / totalEligible : 0;
    const percentAgainst =
      totalEligible > 0 ? votesAgainst.length / totalEligible : 0;

    let newStatus = "active";

    // Passed if >= threshold voted yes (majority or equal)
    if (percentFor >= vote.threshold) {
      newStatus = "passed";
    }
    // Failed if impossible to reach threshold
    else if (percentAgainst > 1 - vote.threshold) {
      newStatus = "failed";
    }
    // Or if everyone voted and didn't pass
    else if (totalVotes === totalEligible && percentFor < vote.threshold) {
      newStatus = "failed";
    }

    if (newStatus !== "active") {
      return await prisma.collaborativeVote.update({
        where: { id: voteId },
        data: {
          status: newStatus,
          resolvedAt: new Date(),
        },
      });
    }

    return vote;
  },

  /**
   * Expire old votes
   */
  async expireOldVotes() {
    return await prisma.collaborativeVote.updateMany({
      where: {
        status: "active",
        expiresAt: {
          lte: new Date(),
        },
      },
      data: {
        status: "expired",
        resolvedAt: new Date(),
      },
    });
  },

  /**
   * Get vote statistics
   */
  async getVoteStats(voteId) {
    const vote = await prisma.collaborativeVote.findUnique({
      where: { id: voteId },
    });

    if (!vote) return null;

    const targetUserIds = vote.targetUserIds || [];
    const votesFor = vote.votesFor || [];
    const votesAgainst = vote.votesAgainst || [];
    const totalEligible = targetUserIds.length;
    const totalVoted = votesFor.length + votesAgainst.length;

    return {
      votesFor: votesFor.length,
      votesAgainst: votesAgainst.length,
      totalEligible,
      totalVoted,
      percentFor:
        totalEligible > 0 ? (votesFor.length / totalEligible) * 100 : 0,
      percentVoted: totalEligible > 0 ? (totalVoted / totalEligible) * 100 : 0,
      needed: Math.ceil(totalEligible * vote.threshold),
      status: vote.status,
    };
  },
};
