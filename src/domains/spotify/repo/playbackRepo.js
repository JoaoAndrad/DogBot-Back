const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * TrackPlayback repository - handles play records
 */
module.exports = {
  /**
   * Create new playback record
   */
  async create(playbackData) {
    return prisma.trackPlayback.create({
      data: {
        accountId: playbackData.accountId,
        userId: playbackData.userId,
        trackId: playbackData.trackId,
        deviceId: playbackData.deviceId,
        deviceType: playbackData.deviceType,
        contextType: playbackData.contextType,
        contextId: playbackData.contextId,
        startedAt: playbackData.startedAt || new Date(),
        listenedMs: BigInt(playbackData.listenedMs || 0),
        percentPlayed: playbackData.percentPlayed,
        wasSkipped: playbackData.wasSkipped,
        wasRepeated: playbackData.wasRepeated,
        isFirstPlay: playbackData.isFirstPlay,
        sessionId: playbackData.sessionId,
        source: playbackData.source || "monitor",
        metadata: playbackData.metadata || {},
      },
    });
  },

  /**
   * Update existing playback
   */
  async update(playbackId, updates) {
    return prisma.trackPlayback.update({
      where: { id: playbackId },
      data: {
        // allow zero values (0) to be written, so check against undefined
        listenedMs:
          updates.listenedMs !== undefined
            ? BigInt(updates.listenedMs)
            : undefined,
        percentPlayed: updates.percentPlayed,
        endedAt: updates.endedAt,
        wasSkipped: updates.wasSkipped,
        wasRepeated: updates.wasRepeated,
        metadata: updates.metadata,
      },
    });
  },

  /**
   * Find playbacks by user with filters
   */
  async findByUser(userId, filters = {}, pagination = {}) {
    const { page = 1, limit = 50 } = pagination;
    const skip = (page - 1) * limit;

    const where = {
      userId,
      ...filters,
    };

    const [playbacks, total] = await Promise.all([
      prisma.trackPlayback.findMany({
        where,
        include: {
          track: true,
        },
        orderBy: { startedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.trackPlayback.count({ where }),
    ]);

    return {
      data: playbacks,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  },

  /**
   * Check if this is the first play of a track for a user
   */
  async isFirstPlayForUser(userId, trackId) {
    const count = await prisma.trackPlayback.count({
      where: { userId, trackId },
    });
    return count === 0;
  },

  /**
   * Get recent playbacks for a user
   */
  async getRecent(userId, limit = 20) {
    return prisma.trackPlayback.findMany({
      where: { userId },
      include: { track: true },
      orderBy: { startedAt: "desc" },
      take: limit,
    });
  },

  /**
   * Get playbacks for a specific period
   */
  async getByPeriod(userId, startDate, endDate) {
    return prisma.trackPlayback.findMany({
      where: {
        userId,
        startedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: { track: true },
      orderBy: { startedAt: "desc" },
    });
  },

  /**
   * Get aggregated stats for a user in a period
   */
  async getAggregatedStats(userId, startDate, endDate) {
    const playbacks = await this.getByPeriod(userId, startDate, endDate);

    const totalMinutes = playbacks.reduce(
      (sum, p) => sum + Number(p.listenedMs) / 60000,
      0
    );

    const uniqueTracks = new Set(playbacks.map((p) => p.trackId)).size;

    return {
      totalPlaybacks: playbacks.length,
      totalMinutes: Math.round(totalMinutes),
      uniqueTracks,
      playbacks,
    };
  },

  /**
   * Delete old playbacks (cleanup)
   */
  async deleteOlderThan(days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return prisma.trackPlayback.deleteMany({
      where: {
        startedAt: { lt: cutoffDate },
        source: "monitor", // only delete auto-tracked, keep imports
      },
    });
  },
  /**
   * Find playback by id
   */
  async findById(id) {
    return prisma.trackPlayback.findUnique({ where: { id } });
  },

  /**
   * Find the most recent non-skipped playback for this user/track excluding a playback id
   */
  async findPreviousNonSkipped(userId, trackId, excludeId = null) {
    const where = {
      userId,
      trackId,
      wasSkipped: false,
    };
    if (excludeId) where.id = { not: excludeId };

    return prisma.trackPlayback.findFirst({
      where,
      orderBy: { endedAt: "desc" },
    });
  },
};
