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
      const {
        userId: rawUserId,
        from,
        to,
        page = 1,
        limit = 50,
        scope,
      } = req.query;

      if (!rawUserId) {
        return res.status(400).json({ error: "userId is required" });
      }

      // Resolve external identifier to internal UUID when necessary.
      let userId = rawUserId;
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          rawUserId
        );
      if (!isUUID) {
        try {
          const userRepo = require("../../users/repo/userRepo");
          const u = await userRepo.findByIdentifierExact(rawUserId);
          if (u && u.id) userId = u.id;
          else {
            const base = userRepo.extractBaseNumber(rawUserId);
            const u2 = await userRepo.findByBaseNumber(base);
            if (u2 && u2.id) userId = u2.id;
          }
        } catch (e) {
          // resolution failed -> keep rawUserId (may be group-scoped call)
        }
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

      // Normalize result to match frontend expectations: { items: [...], page, limit, total, totalPages }
      const items = (result.data || []).map((p) => {
        return {
          id: p.id,
          track: p.track
            ? {
                id: p.track.id,
                name: p.track.name,
                artists: p.track.artists,
                album: p.track.album,
                imageUrl: p.track.imageUrl,
                durationMs: p.track.durationMs,
              }
            : undefined,
          startedAt: p.startedAt,
          endedAt: p.endedAt || null,
          listenedMs: p.listenedMs !== undefined ? Number(p.listenedMs) : 0,
          percentPlayed: p.percentPlayed !== undefined ? p.percentPlayed : null,
          wasSkipped: !!p.wasSkipped,
          metadata: p.metadata || {},
        };
      });

      res.json({
        items,
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      });
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
      const { userId: rawUserId, month, scope } = req.query;

      if (!rawUserId) {
        return res.status(400).json({ error: "userId is required" });
      }

      // Resolve external identifier to internal UUID when necessary.
      let userId = rawUserId;
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          rawUserId
        );
      if (!isUUID) {
        try {
          const userRepo = require("../../users/repo/userRepo");
          const u = await userRepo.findByIdentifierExact(rawUserId);
          if (u && u.id) userId = u.id;
          else {
            const base = userRepo.extractBaseNumber(rawUserId);
            const u2 = await userRepo.findByBaseNumber(base);
            if (u2 && u2.id) userId = u2.id;
          }
        } catch (e) {
          // ignore and proceed with rawUserId
        }
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
      const { userId: rawUserId, days = 7, from, to } = req.query;

      if (!rawUserId) {
        return res.status(400).json({ error: "userId is required" });
      }

      // Resolve external identifier to internal UUID when necessary.
      let userId = rawUserId;
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          rawUserId
        );
      if (!isUUID) {
        try {
          const userRepo = require("../../users/repo/userRepo");
          const u = await userRepo.findByIdentifierExact(rawUserId);
          if (u && u.id) userId = u.id;
          else {
            const base = userRepo.extractBaseNumber(rawUserId);
            const u2 = await userRepo.findByBaseNumber(base);
            if (u2 && u2.id) userId = u2.id;
          }
        } catch (e) {
          // ignore resolution errors
        }
      }

      let periodStart, periodEnd;
      if (from || to) {
        periodStart = from ? new Date(from) : new Date(0);
        periodEnd = to ? new Date(to) : new Date();
      } else {
        const daysNum = Math.max(1, Math.min(365, Number(days)));
        periodEnd = new Date();
        periodStart = new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000);
      }

      // Fetch playbacks in period
      const playbacks = await playbackRepo.getByPeriod(
        userId,
        periodStart,
        periodEnd
      );

      const totalPlays = playbacks.length;
      const uniqueTracks = new Set(playbacks.map((p) => p.trackId)).size;
      const totalListenMs = playbacks.reduce(
        (s, p) => s + Number(p.listenedMs || 0),
        0
      );

      // Activity last N days by weekday (Mon-Sun)
      const weekdayCounts = [0, 0, 0, 0, 0, 0, 0]; // Sun..Sat
      playbacks.forEach((p) => {
        const d = new Date(p.startedAt);
        const w = d.getDay();
        weekdayCounts[w] = (weekdayCounts[w] || 0) + 1;
      });

      // Map to Mon..Sun order for display
      const daysLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
      const activity = daysLabels.map((label, idx) => ({
        day: label,
        count: weekdayCounts[idx] || 0,
      }));

      // Top artists in period
      const artistCounts = {};
      playbacks.forEach((p) => {
        const artists = (p.track && p.track.artists) || [];
        if (Array.isArray(artists)) {
          artists.forEach((a) => {
            const name = String(a || "");
            if (!name) return;
            artistCounts[name] = (artistCounts[name] || 0) + 1;
          });
        } else if (artists) {
          const name = String(artists);
          artistCounts[name] = (artistCounts[name] || 0) + 1;
        }
      });
      const topArtists = Object.entries(artistCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Recent discoveries (isFirstPlay true) - most recent
      const discoveries = playbacks
        .filter((p) => p.isFirstPlay)
        .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
        .slice(0, 10)
        .map((p) => ({
          track: p.track
            ? { id: p.track.id, name: p.track.name, artists: p.track.artists }
            : null,
          whenMs: Date.now() - new Date(p.startedAt).getTime(),
        }));

      // Repeats: tracks with play count >1 in period
      const trackCounts = {};
      playbacks.forEach((p) => {
        trackCounts[p.trackId] = (trackCounts[p.trackId] || 0) + 1;
      });
      const repeats = Object.entries(trackCounts)
        .filter(([tid, cnt]) => cnt > 1)
        .map(([tid, cnt]) => {
          const t = playbacks.find((p) => p.trackId === tid).track;
          return {
            track: t
              ? { id: t.id, name: t.name, artists: t.artists, imageUrl: t.imageUrl }
              : { id: tid },
            count: cnt,
          };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);

      // Top 8 unique album images from most played tracks
      // Group by album name and sum play counts, then get unique images
      const albumData = {};
      playbacks.forEach((p) => {
        const album = p.track?.album || 'Unknown';
        const imageUrl = p.track?.imageUrl;
        
        if (!albumData[album]) {
          albumData[album] = {
            playCount: 0,
            imageUrl: imageUrl,
          };
        }
        albumData[album].playCount++;
      });
      
      const topAlbumImages = Object.entries(albumData)
        .filter(([album, data]) => data.imageUrl) // only albums with images
        .sort((a, b) => b[1].playCount - a[1].playCount) // sort by play count
        .slice(0, 8) // get top 8
        .map(([album, data]) => data.imageUrl); // extract image URLs

      // Time-of-day distribution (by listenedMs)
      const bins = { morning: 0, afternoon: 0, evening: 0, night: 0 };
      playbacks.forEach((p) => {
        const h = new Date(p.startedAt).getHours();
        const ms = Number(p.listenedMs || 0);
        if (h >= 6 && h < 12) bins.morning += ms;
        else if (h >= 12 && h < 18) bins.afternoon += ms;
        else if (h >= 18 && h < 24) bins.evening += ms;
        else bins.night += ms;
      });
      const totalBinMs =
        bins.morning + bins.afternoon + bins.evening + bins.night || 1;
      const timeOfDay = {
        morning: Math.round((bins.morning / totalBinMs) * 100),
        afternoon: Math.round((bins.afternoon / totalBinMs) * 100),
        evening: Math.round((bins.evening / totalBinMs) * 100),
        night: Math.round((bins.night / totalBinMs) * 100),
      };

      // Last 3 songs (global recent)
      const recent = await playbackRepo.getRecent(userId, 3);
      const last3 = recent.map((p) => ({
        track: p.track
          ? { id: p.track.id, name: p.track.name, artists: p.track.artists }
          : null,
        whenMs: Date.now() - new Date(p.startedAt).getTime(),
      }));

      let periodToken =
        req.query && req.query.period ? String(req.query.period) : null;
      res.json({
        period: periodToken,
        summary: {
          totalPlays,
          uniqueTracks,
          totalListenMs,
        },
        activity: activity, // array Mon..Sun with counts
        topArtists,
        topAlbumImages,
        discoveries,
        repeats,
        timeOfDay,
        last3,
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
      // Try to fetch currently-playing directly from Spotify (real-time)
      const userSpotifyAdapter = require("../../../services/userSpotifyAdapter");
      const userRepo = require("../../users/repo/userRepo");

      // Resolve external identifier to internal UUID if needed
      let resolvedUserId = userId;
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          userId
        );
      if (!isUUID) {
        try {
          const u = await userRepo.findByIdentifierExact(userId);
          if (u && u.id) resolvedUserId = u.id;
          else {
            const base = userRepo.extractBaseNumber(userId);
            const u2 = await userRepo.findByBaseNumber(base);
            if (u2 && u2.id) resolvedUserId = u2.id;
          }
        } catch (e) {
          // ignore resolution errors and continue with original userId
        }
      }

      try {
        const live = await userSpotifyAdapter.getCurrentlyPlaying(
          resolvedUserId
        );
        // If adapter returned a friendly message (e.g., Spotify global block), surface it
        if (live && !live.playing && live.message) {
          return res.json({
            playing: false,
            notice: live.message,
            blockedUntil: live.blockedUntil || null,
          });
        }
        if (live && live.playing && !live.error) {
          const durationMs = live.duration_ms || live.durationMs || 0;
          const progressMs = live.progress_ms || live.progressMs || 0;
          const percentPlayed = durationMs
            ? (progressMs / durationMs) * 100
            : 0;

          return res.json({
            playing: true,
            track: {
              id: live.id,
              name: live.name,
              artists: live.artists,
              album: live.album,
              imageUrl: live.image,
              durationMs: durationMs,
              previewUrl: live.preview_url,
              preview_url: live.preview_url,
            },
            startedAt: new Date(Date.now() - progressMs),
            listenedMs: progressMs,
            percentPlayed,
            source: "live",
          });
        }
      } catch (err) {
        console.warn(
          "/api/spotify/current: live lookup failed",
          err && err.message
        );
      }

      // Fallback: Get most recent playback from DB
      const recent = await playbackRepo.getRecent(userId, 1);

      if (recent.length === 0) {
        return res.json({ playing: false });
      }

      const current = recent[0];

      // If preview is not present in DB, try to fetch from Spotify Tracks API
      let preview =
        current.track.previewUrl || current.track.preview_url || null;
      if (!preview) {
        try {
          const spotifyService = require("../../../services/spotifyService");
          const prisma = spotifyService.prisma;
          // Try to find a spotify account linked to this user to auth the track request
          const acct = await prisma.spotifyAccount.findFirst({
            where: { userId },
          });
          if (acct && acct.id) {
            try {
              const trackRes = await spotifyService.spotifyFetch(
                acct.id,
                `https://api.spotify.com/v1/tracks/${encodeURIComponent(
                  current.track.id
                )}`
              );
              if (trackRes && trackRes.ok) {
                const trackJson = await trackRes.json();
                preview =
                  trackJson && (trackJson.preview_url || trackJson.previewUrl)
                    ? trackJson.preview_url || trackJson.previewUrl
                    : null;
              }
            } catch (innerErr) {
              console.warn(
                "/api/spotify/current: failed fetching track metadata",
                innerErr && innerErr.message
              );
            }
          }
        } catch (e) {
          // ignore and continue without preview
        }
      }

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
          previewUrl: preview,
          preview_url: preview,
        },
        startedAt: current.startedAt,
        listenedMs: Number(current.listenedMs),
        percentPlayed: current.percentPlayed,
        source: "db",
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
