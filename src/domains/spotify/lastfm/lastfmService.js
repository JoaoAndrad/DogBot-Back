const fetch = require("node-fetch");
const logger = require("../../../lib/logger");

const API_ROOT = "http://ws.audioscrobbler.com/2.0/";
const API_KEY = process.env.LASTFM_API_KEY;

if (!API_KEY) {
  logger.warn(
    "LASTFM_API_KEY not set - Last.fm features will fail until configured.",
  );
}

async function getSimilarTracks(trackName, artistName, limit = 10) {
  if (!API_KEY) throw new Error("LASTFM_API_KEY not configured");
  const params = new URLSearchParams({
    method: "track.getsimilar",
    track: trackName || "",
    artist: artistName || "",
    api_key: API_KEY,
    format: "json",
    autocorrect: "1",
    limit: String(limit),
  });
  logger.info(
    `[LastfmService] getSimilarTracks track="${trackName}" artist="${artistName}" limit=${limit}`,
  );

  const url = `${API_ROOT}?${params.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "DogBotReborn/1.0 (+https://dogbot.squareweb.app)",
    },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => null);
    throw new Error(`Last.fm fetch failed: ${res.status} ${t || ""}`);
  }
  const data = await res.json();
  // data.similartracks.track is expected
  const tracks = (data && data.similartracks && data.similartracks.track) || [];
  try {
    const names = tracks
      .slice(0, 5)
      .map((t) => `${t.name} - ${t.artist?.name || t.artist}`);
    logger.info(
      `[LastfmService] getSimilarTracks resultCount=${tracks.length} sample=${JSON.stringify(names)}`,
    );
  } catch (e) {
    // ignore logging errors
  }
  // Normalize into simple objects: { name, artist, match }
  return tracks.map((t) => ({
    name: t.name,
    artist: t.artist && t.artist.name ? t.artist.name : t.artist || null,
    match: t.match ? Number(t.match) : null,
  }));
}

async function getArtistTopTracks(artistName, limit = 10) {
  if (!API_KEY) throw new Error("LASTFM_API_KEY not configured");
  const params = new URLSearchParams({
    method: "artist.gettoptracks",
    artist: artistName || "",
    api_key: API_KEY,
    format: "json",
    autocorrect: "1",
    limit: String(limit),
  });
  const url = `${API_ROOT}?${params.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "DogBotReborn/1.0 (+https://dogbot.squareweb.app)",
    },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => null);
    throw new Error(`Last.fm fetch failed: ${res.status} ${t || ""}`);
  }
  const data = await res.json();
  const tracks = (data && data.toptracks && data.toptracks.track) || [];
  return tracks.map((t) => ({
    name: t.name,
    artist: t.artist && t.artist.name ? t.artist.name : null,
  }));
}

module.exports = { getSimilarTracks, getArtistTopTracks };
