const path = require("path");
const { spotifyFetch } = require(
  path.join(__dirname, "..", "..", "..", "services", "spotifyService"),
);

/**
 * Get recommendations from Spotify using provided seeds.
 * seeds: { seed_tracks: [], seed_artists: [], seed_genres: [] }
 * limit: number (1..100)
 * Returns array of track objects (as returned by the API).
 */
async function getRecommendations(accountId, seeds = {}, limit = 20) {
  if (!accountId) throw new Error("accountId required");

  const params = new URLSearchParams();
  if (Array.isArray(seeds.seed_tracks) && seeds.seed_tracks.length)
    params.set("seed_tracks", seeds.seed_tracks.slice(0, 5).join(","));
  if (Array.isArray(seeds.seed_artists) && seeds.seed_artists.length)
    params.set("seed_artists", seeds.seed_artists.slice(0, 5).join(","));
  if (Array.isArray(seeds.seed_genres) && seeds.seed_genres.length)
    params.set("seed_genres", seeds.seed_genres.slice(0, 5).join(","));

  params.set("limit", Math.max(1, Math.min(100, limit)));

  const url = `https://api.spotify.com/v1/recommendations?${params.toString()}`;
  const res = await spotifyFetch(accountId, url, { method: "GET" });
  if (!res || !res.ok) {
    const text = await (
      res && res.text ? res.text() : Promise.resolve(null)
    ).catch(() => null);
    throw new Error(
      `Spotify recommendations error: ${res && res.status} ${text || ""}`,
    );
  }
  const data = await res.json();
  return data.tracks || [];
}

module.exports = { getRecommendations };
