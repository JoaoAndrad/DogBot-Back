const path = require("path");
const { spotifyFetch } = require(
  path.join(__dirname, "..", "..", "..", "services", "spotifyService"),
);
const { getSimilarTracks, getArtistTopTracks } = require("./lastfmService");

function normalizeName(s) {
  if (!s) return "";
  return s
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\p{P}\p{S}]/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function findBestSpotifyMatch(accountId, trackName, artistName) {
  // Search Spotify by track + artist exact first
  const q = `track:"${trackName}" artist:"${artistName}"`;
  const params = new URLSearchParams({ q, type: "track", limit: "5" });
  let res = await spotifyFetch(
    accountId,
    `https://api.spotify.com/v1/search?${params.toString()}`,
  );
  if (!res || !res.ok) {
    // try looser query (track only)
    const q2 = `track:"${trackName}"`;
    const params2 = new URLSearchParams({ q: q2, type: "track", limit: "5" });
    res = await spotifyFetch(
      accountId,
      `https://api.spotify.com/v1/search?${params2.toString()}`,
    );
    if (!res || !res.ok) return null;
  }
  const data = await res.json();
  const items = (data && data.tracks && data.tracks.items) || [];
  if (!items.length) return null;

  const targetArtistNorm = normalizeName(artistName);

  // Prefer item whose any artist matches normalized artist name
  for (const it of items) {
    const artistNames = (it.artists || []).map((a) => normalizeName(a.name));
    if (artistNames.includes(targetArtistNorm)) return it;
  }

  // No exact artist match; accept top item only if Last.fm confidence high is handled by caller
  return items[0] || null;
}

async function resolveCandidatesToSpotify(accountId, candidates = []) {
  const resolved = [];
  for (const c of candidates) {
    try {
      const match = await findBestSpotifyMatch(accountId, c.name, c.artist);
      if (match) resolved.push({ lastfm: c, spotify: match });
    } catch (e) {
      // ignore per-candidate failures
    }
  }
  return resolved;
}

async function generateCandidatesFromSeed(
  accountId,
  trackName,
  artistName,
  opts = {},
) {
  const limit = opts.limit || 8;
  let candidates = [];
  try {
    candidates = await getSimilarTracks(trackName, artistName, limit);
  } catch (e) {
    // fallback to artist top tracks
    try {
      candidates = await getArtistTopTracks(artistName, limit);
    } catch (e2) {
      candidates = [];
    }
  }
  // resolve to spotify
  const resolved = await resolveCandidatesToSpotify(accountId, candidates);
  return resolved; // array of { lastfm, spotify }
}

module.exports = {
  normalizeName,
  findBestSpotifyMatch,
  resolveCandidatesToSpotify,
  generateCandidatesFromSeed,
};
