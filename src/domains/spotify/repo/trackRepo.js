const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Track repository - handles track metadata CRUD
 */
module.exports = {
  /**
   * Upsert track with metadata
   * Only updates if new data is richer (has features, genres, etc.)
   */
  async upsertTrack(trackData) {
    const existing = await prisma.track.findUnique({
      where: { id: trackData.id },
    });

    // If exists and already has features, don't overwrite unless forced
    if (existing && existing.audioFeatures && !trackData.forceUpdate) {
      return existing;
    }

    return prisma.track.upsert({
      where: { id: trackData.id },
      create: {
        id: trackData.id,
        name: trackData.name,
        artists: trackData.artists || [],
        album: trackData.album,
        durationMs: trackData.durationMs,
        genres: trackData.genres || [],
        audioFeatures: trackData.audioFeatures,
        popularity: trackData.popularity,
        releaseDate: trackData.releaseDate,
        imageUrl: trackData.imageUrl,
        metadata: trackData.metadata || {},
      },
      update: {
        name: trackData.name,
        artists: trackData.artists,
        album: trackData.album,
        durationMs: trackData.durationMs,
        genres: trackData.genres || existing?.genres || [],
        audioFeatures: trackData.audioFeatures || existing?.audioFeatures,
        popularity: trackData.popularity,
        releaseDate: trackData.releaseDate,
        imageUrl: trackData.imageUrl,
        metadata: trackData.metadata || existing?.metadata,
      },
    });
  },

  /**
   * Find track by ID
   */
  async findById(trackId) {
    return prisma.track.findUnique({
      where: { id: trackId },
    });
  },

  /**
   * Search tracks by name or artist
   */
  async search(query, limit = 20) {
    // Simple search - can be enhanced with full-text search
    return prisma.track.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { album: { contains: query, mode: "insensitive" } },
        ],
      },
      take: limit,
      orderBy: { popularity: "desc" },
    });
  },

  /**
   * Update or create track stats
   */
  async incrementStats(trackId, listenedMs) {
    const updated = await prisma.trackStat.upsert({
      where: { trackId },
      create: {
        trackId,
        playCount: 1,
        totalListenMs: BigInt(listenedMs),
        avgSessionMs: Math.round(listenedMs),
        lastPlayedAt: new Date(),
      },
      update: {
        playCount: { increment: 1 },
        totalListenMs: { increment: BigInt(listenedMs) },
        lastPlayedAt: new Date(),
      },
    });

    // Recalculate avgSessionMs from the updated totals (best-effort)
    try {
      if (updated.playCount > 0) {
        const avg = Math.round(
          Number(updated.totalListenMs) / updated.playCount,
        );
        await prisma.trackStat.update({
          where: { trackId },
          data: { avgSessionMs: avg },
        });
      }
    } catch (e) {
      // best-effort, ignore
    }

    return updated;
  },

  /**
   * Get top tracks globally or for user
   */
  async getTopTracks(limit = 50, userId = null) {
    if (userId) {
      // Top tracks for specific user via playbacks
      const result = await prisma.trackPlayback.groupBy({
        by: ["trackId"],
        where: { userId },
        _sum: { listenedMs: true },
        _count: { id: true },
        orderBy: { _sum: { listenedMs: "desc" } },
        take: limit,
      });

      // Enrich with track data
      const trackIds = result.map((r) => r.trackId);
      const tracks = await prisma.track.findMany({
        where: { id: { in: trackIds } },
      });

      return result.map((r) => ({
        ...tracks.find((t) => t.id === r.trackId),
        totalListenedMs: Number(r._sum.listenedMs),
        playCount: r._count.id,
      }));
    }

    // Global top tracks
    return prisma.track.findMany({
      include: { stats: true },
      orderBy: { stats: { playCount: "desc" } },
      take: limit,
    });
  },
};
