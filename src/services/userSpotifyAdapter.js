const {
  prisma,
  spotifyFetch,
  getLatestTokenByAccountId,
} = require("./spotifyService");

/**
 * Minimal adapter that implements the `userSpotifyAPI` shape used by the monitor.
 * - getConnectedUsers(): returns array of userId strings
 * - getCurrentlyPlaying(userId): returns simplified track info or { playing: false }
 * - getUserProfile(userId): returns profile object { displayName, spotifyId, ... }
 */
module.exports = {
  async getConnectedUsers() {
    const accounts = await prisma.spotifyAccount.findMany({
      where: { userId: { not: null } },
      select: { userId: true, id: true },
    });
    // Return only unique userIds
    return Array.from(new Set(accounts.map((a) => a.userId).filter(Boolean)));
  },

  async getCurrentlyPlaying(userId) {
    if (!userId) {
      return { playing: false, message: "no userId" };
    }
    const account = await prisma.spotifyAccount.findFirst({
      where: { userId },
    });
    if (!account) return { playing: false, message: "no account" };

    try {
      const res = await spotifyFetch(
        account.id,
        "https://api.spotify.com/v1/me/player/currently-playing"
      );
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

  async getUserProfile(userId) {
    const account = await prisma.spotifyAccount.findFirst({
      where: { userId },
    });
    if (!account) return null;
    try {
      const res = await spotifyFetch(
        account.id,
        "https://api.spotify.com/v1/me"
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

  async getPlaylist(userId, playlistId) {
    const account = await prisma.spotifyAccount.findFirst({
      where: { userId },
    });
    if (!account) return null;
    try {
      const res = await spotifyFetch(
        account.id,
        `https://api.spotify.com/v1/playlists/${playlistId}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data;
    } catch (e) {
      return null;
    }
  },
};
