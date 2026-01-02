const playbackRepo = require("../repo/playbackRepo");
const summaryRepo = require("../repo/summaryRepo");
const trackRepo = require("../repo/trackRepo");

/**
 * Spotify History Controller
 * Handles endpoints for querying user listening history
 */
module.exports = {
  /**
   * GET /api/spotify/history
   * Query parameters: userId, from, to, page, limit
   */
  async getHistory(req, res) {
    try {
      const { userId, from, to, page = 1, limit = 50 } = req.query;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const filters = {};

      if (from || to) {
        filters.startedAt = {};
        if (from) filters.startedAt.gte = new Date(from);
        if (to) filters.startedAt.lte = new Date(to);
      }

      const result = await playbackRepo.findByUser(userId, filters, {
        page: parseInt(page),
        limit: parseInt(limit),
      });

      res.json(result);
    } catch (error) {
      console.log("[HistoryController] getHistory error:", error);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * GET /api/spotify/summary
   * Query parameters: userId, month (YYYY-MM)
   */
  async getSummary(req, res) {
    try {
      const { userId, month } = req.query;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      if (!month) {
        // Get overall summary
        const summary = await summaryRepo.getSummary(userId);
        return res.json(summary || { totalListenMs: 0, dailyListen: {} });
      }

      // Get monthly summary
      const monthlySummary = await summaryRepo.getMonthlySummary(userId, month);

      if (!monthlySummary) {
        return res.json({
          month,
          totalMs: 0,
          playCount: 0,
          days: [],
        });
      }

      // Get top tracks for the month
      const monthStart = new Date(`${month}-01`);
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);

      const stats = await playbackRepo.getAggregatedStats(
        userId,
        monthStart,
        monthEnd
      );

      // Get top tracks
      const topTracks = await this._getTopTracksFromPlaybacks(stats.playbacks);

      res.json({
        ...monthlySummary,
        topTracks: topTracks.slice(0, 10),
        stats,
      });
    } catch (error) {
      console.log("[HistoryController] getSummary error:", error);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * GET /api/spotify/stats
   * Query parameters: userId
   */
  async getStats(req, res) {
    try {
      const { userId } = req.query;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      // Get overall summary
      const summary = await summaryRepo.getSummary(userId);

      // Get top tracks (all time)
      const topTracks = await trackRepo.getTopTracks(10, userId);

      // Get recent plays
      const recentPlays = await playbackRepo.getRecent(userId, 20);

      res.json({
        totalMinutes: summary
          ? Math.floor(Number(summary.totalListenMs) / 60000)
          : 0,
        topTracks: topTracks.map((t) => ({
          id: t.id,
          name: t.name,
          artists: t.artists,
          imageUrl: t.imageUrl,
          totalMinutes: Math.floor(t.totalListenedMs / 60000),
          playCount: t.playCount,
        })),
        recentPlays: recentPlays.map((p) => ({
          track: {
            id: p.track.id,
            name: p.track.name,
            artists: p.track.artists,
            imageUrl: p.track.imageUrl,
          },
          playedAt: p.startedAt,
          listenedMinutes: Math.floor(Number(p.listenedMs) / 60000),
        })),
      });
    } catch (error) {
      console.log("[HistoryController] getStats error:", error);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * GET /api/spotify/current
   * Query parameters: userId
   */
  async getCurrent(req, res) {
    try {
      const { userId } = req.query;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      // Get most recent playback
      const recent = await playbackRepo.getRecent(userId, 1);

      if (recent.length === 0) {
        return res.json({ playing: false });
      }

      const current = recent[0];

      res.json({
        playing:
          !current.endedAt ||
          Date.now() - new Date(current.endedAt).getTime() < 30000,
        track: {
          id: current.track.id,
          name: current.track.name,
          artists: current.track.artists,
          album: current.track.album,
          imageUrl: current.track.imageUrl,
          durationMs: current.track.durationMs,
        },
        startedAt: current.startedAt,
        listenedMs: Number(current.listenedMs),
        percentPlayed: current.percentPlayed,
      });
    } catch (error) {
      console.log("[HistoryController] getCurrent error:", error);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * Helper: Get top tracks from playbacks list
   */
  async _getTopTracksFromPlaybacks(playbacks) {
    const trackStats = {};

    playbacks.forEach((p) => {
      if (!trackStats[p.trackId]) {
        trackStats[p.trackId] = {
          trackId: p.trackId,
          name: p.track.name,
          artists: p.track.artists,
          imageUrl: p.track.imageUrl,
          totalMs: 0,
          playCount: 0,
        };
      }
      trackStats[p.trackId].totalMs += Number(p.listenedMs);
      trackStats[p.trackId].playCount++;
    });

    return Object.values(trackStats)
      .sort((a, b) => b.totalMs - a.totalMs)
      .map((t) => ({
        ...t,
        totalMinutes: Math.floor(t.totalMs / 60000),
      }));
  },
};
