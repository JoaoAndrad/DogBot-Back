const {
  prisma,
  spotifyFetch,
  getLatestTokenByAccountId,
} = require("./spotifyService");

/**
 * Minimal adapter that implements the `userSpotifyAPI` shape used by the monitor.
 * - getConnectedUsers(): returns array of { userId, accountId } — properly linked accounts only
 * - getCurrentlyPlaying(userId, accountId): uses the provided accountId directly
 * - getUserProfile(userId, accountId): uses the provided accountId directly
 */
module.exports = {
  async getConnectedUsers() {
    const accounts = await prisma.spotifyAccount.findMany({
      where: { userId: { not: null } },
      select: { userId: true, id: true },
      orderBy: { createdAt: "asc" },
    });
    // One entry per userId — oldest (primary) account wins
    const seen = new Map();
    for (const a of accounts) {
      if (a.userId && !seen.has(a.userId)) {
        seen.set(a.userId, { userId: a.userId, accountId: a.id });
      }
    }
    return Array.from(seen.values());
  },

  async getCurrentlyPlaying(userId, accountId) {
    if (!userId) {
      return { playing: false, message: "no userId" };
    }
    // Use provided accountId; fallback to DB only as last resort
    let resolvedAccountId = accountId;
    if (!resolvedAccountId) {
      const account = await prisma.spotifyAccount.findFirst({
        where: { userId },
        orderBy: { createdAt: "asc" },
      });
      resolvedAccountId = account?.id;
    }
    if (!resolvedAccountId) return { playing: false, message: "no account" };

    try {
      const res = await spotifyFetch(
        resolvedAccountId,
        "https://api.spotify.com/v1/me/player/currently-playing",
      );
      // If Spotify service is globally blocked, propagate friendly message
      if (res && res.status === 429) {
        const text = (await (res.text ? res.text() : null)) || null;
        return {
          playing: false,
          message: text,
          blockedUntil: res.blockedUntil || null,
        };
      }
      if (res.status === 204) {
        return { playing: false, message: "Nenhuma música tocando" };
      }
      if (!res.ok) {
        const text = await res.text().catch(() => null);
        return { error: `Spotify API error ${res.status}`, details: text };
      }
      const data = await res.json();
      if (!data || !data.item) {
        return { playing: false, message: "Nenhuma música tocando" };
      }

      const item = data.item;
      const trackId = item.id;
      const trackUrl = item.external_urls?.spotify || null;
      return {
        playing: !!data.is_playing,
        userId,
        id: trackId,
        url: trackUrl,
        name: item.name,
        artists: item.artists ? item.artists.map((a) => a.name) : [],
        album: item.album?.name || null,
        image: item.album?.images?.[0]?.url || null,
        progress_ms: data.progress_ms || 0,
        duration_ms: item.duration_ms || null,
        popularity: item.popularity,
        explicit: item.explicit,
        preview_url: item.preview_url,
        is_playing: data.is_playing,
      };
    } catch (err) {
      return { error: err.message };
    }
  },

  async getUserProfile(userId, accountId) {
    let resolvedAccountId = accountId;
    if (!resolvedAccountId) {
      const account = await prisma.spotifyAccount.findFirst({
        where: { userId },
        orderBy: { createdAt: "asc" },
      });
      resolvedAccountId = account?.id;
    }
    if (!resolvedAccountId) return null;
    try {
      const res = await spotifyFetch(
        resolvedAccountId,
        "https://api.spotify.com/v1/me",
      );
      if (!res.ok) return null;
      const data = await res.json();
      return {
        success: true,
        userId,
        displayName: data.display_name,
        spotifyId: data.id,
        followers: data.followers?.total,
        country: data.country,
        product: data.product,
        images: data.images,
      };
    } catch (e) {
      return null;
    }
  },

  async getPlaylist(userId, playlistId, accountId) {
    let resolvedAccountId = accountId;
    if (!resolvedAccountId) {
      const account = await prisma.spotifyAccount.findFirst({
        where: { userId },
        orderBy: { createdAt: "asc" },
      });
      resolvedAccountId = account?.id;
    }
    if (!resolvedAccountId) return null;
    try {
      const res = await spotifyFetch(
        resolvedAccountId,
        `https://api.spotify.com/v1/playlists/${playlistId}`,
      );
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  },
};
