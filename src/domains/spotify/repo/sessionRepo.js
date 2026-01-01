const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Listening session repository - groups playbacks into sessions
 */
module.exports = {
  /**
   * Get active session for user (within last 20 minutes)
   */
  async getActiveSession(userId) {
    const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000);

    return prisma.listeningSession.findFirst({
      where: {
        userId,
        endedAt: null,
        startedAt: { gte: twentyMinutesAgo },
      },
      orderBy: { startedAt: "desc" },
    });
  },

  /**
   * Create new session
   */
  async create(userId, deviceType = null, contextType = null) {
    return prisma.listeningSession.create({
      data: {
        userId,
        startedAt: new Date(),
        deviceType,
        contextType,
        trackCount: 0,
        totalMs: BigInt(0),
      },
    });
  },

  /**
   * Update session stats
   */
  async incrementStats(sessionId, listenedMs) {
    return prisma.listeningSession.update({
      where: { id: sessionId },
      data: {
        trackCount: { increment: 1 },
        totalMs: { increment: BigInt(listenedMs) },
      },
    });
  },

  /**
   * End session
   */
  async endSession(sessionId) {
    return prisma.listeningSession.update({
      where: { id: sessionId },
      data: { endedAt: new Date() },
    });
  },

  /**
   * Get user sessions for a period
   */
  async getUserSessions(userId, startDate, endDate) {
    return prisma.listeningSession.findMany({
      where: {
        userId,
        startedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { startedAt: "desc" },
    });
  },
};
