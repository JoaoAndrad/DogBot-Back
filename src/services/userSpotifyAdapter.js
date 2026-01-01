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
    console.log(`[getCurrentlyPlaying] START userId=${userId}`);
    if (!userId) {
      console.log("[getCurrentlyPlaying] no userId provided");
      return { playing: false, message: "no userId" };
    }
    const account = await prisma.spotifyAccount.findFirst({
      where: { userId },
    });
    console.log(
      `[getCurrentlyPlaying] account found:`,
      account ? `id=${account.id}` : "null"
    );
    if (!account) return { playing: false, message: "no account" };

    try {
      console.log(
        `[getCurrentlyPlaying] calling spotifyFetch for account=${account.id}`
      );
      const res = await spotifyFetch(
        account.id,
        "https://api.spotify.com/v1/me/player/currently-playing"
      );
      console.log(`[getCurrentlyPlaying] response status=${res.status}`);
      if (res.status === 204) {
        console.log("[getCurrentlyPlaying] status 204 - no music playing");
        return { playing: false, message: "Nenhuma música tocando" };
      }
      if (!res.ok) {
        const text = await res.text().catch(() => null);
        console.log(
          `[getCurrentlyPlaying] ERROR response not ok: status=${
            res.status
          } body=${text ? text.slice(0, 500) : "null"}`
        );
        return { error: `Spotify API error ${res.status}`, details: text };
      }
      const data = await res.json();
      console.log(
        `[getCurrentlyPlaying] data received:`,
        data ? `is_playing=${data.is_playing} item=${!!data.item}` : "null"
      );
      if (!data || !data.item) {
        console.log("[getCurrentlyPlaying] no data or no item in response");
        return { playing: false, message: "Nenhuma música tocando" };
      }

      const item = data.item;
      const trackId = item.id;
      const trackUrl = item.external_urls?.spotify || null;
      console.log(
        `[getCurrentlyPlaying] SUCCESS track=${item.name} artist=${item.artists?.[0]?.name} is_playing=${data.is_playing}`
      );
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
      console.log(`[getCurrentlyPlaying] ERROR:`, err.message);
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
};
