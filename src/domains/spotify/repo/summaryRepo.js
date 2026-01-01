const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * User summary repository - manages daily/monthly aggregations
 */
module.exports = {
  /**
   * Add listening time to user's daily summary
   */
  async addListeningTime(userId, listenedMs, trackId, date = new Date()) {
    const today = date.toISOString().slice(0, 10); // YYYY-MM-DD
    const month = today.slice(0, 7); // YYYY-MM

    // Get or create summary
    let summary = await prisma.userListeningSummary.findUnique({
      where: { userId },
    });

    if (!summary) {
      summary = await prisma.userListeningSummary.create({
        data: {
          userId,
          totalListenMs: BigInt(0),
          dailyListen: {},
        },
      });
    }

    const dailyListen = summary.dailyListen || {};

    // Initialize month if needed
    if (!dailyListen[month]) {
      dailyListen[month] = { totalMs: 0, playCount: 0, topTrackId: trackId };
    }

    // Initialize day if needed
    if (!dailyListen[today]) {
      dailyListen[today] = { totalMs: 0, playCount: 0 };
    }

    // Update counters
    dailyListen[month].totalMs += listenedMs;
    dailyListen[month].playCount += 1;
    dailyListen[today].totalMs += listenedMs;
    dailyListen[today].playCount += 1;

    // Update in DB
    return prisma.userListeningSummary.update({
      where: { userId },
      data: {
        totalListenMs: { increment: BigInt(listenedMs) },
        dailyListen,
      },
    });
  },

  /**
   * Get user summary
   */
  async getSummary(userId) {
    return prisma.userListeningSummary.findUnique({
      where: { userId },
    });
  },

  /**
   * Get monthly summary
   */
  async getMonthlySummary(userId, month) {
    const summary = await this.getSummary(userId);
    if (!summary || !summary.dailyListen) {
      return null;
    }

    const dailyListen = summary.dailyListen;
    const monthData = dailyListen[month];

    // Get all days in the month
    const days = Object.keys(dailyListen)
      .filter((key) => key.startsWith(month) && key.length === 10)
      .map((day) => ({
        date: day,
        ...dailyListen[day],
      }));

    return {
      month,
      ...monthData,
      days,
    };
  },

  /**
   * Get daily summary
   */
  async getDailySummary(userId, date) {
    const summary = await this.getSummary(userId);
    if (!summary || !summary.dailyListen) {
      return null;
    }

    const dateKey = date.toISOString().slice(0, 10);
    return summary.dailyListen[dateKey] || null;
  },
};
