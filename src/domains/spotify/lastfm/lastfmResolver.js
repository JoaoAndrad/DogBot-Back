const path = require("path");
const { spotifyFetch } = require(
  path.join(__dirname, "..", "..", "..", "services", "spotifyService"),
);
const { getSimilarTracks, getArtistTopTracks } = require("./lastfmService");

// Simple in-memory cache for resolved Spotify matches across process lifetime
const _resolveCache = new Map();

async function resolveToSpotifyCached(accountId, trackName, artistName) {
  const key = `${normalizeName(trackName)}||${normalizeName(artistName)}`;
  if (_resolveCache.has(key)) return _resolveCache.get(key);
  const p = (async () => {
    try {
      const match = await findBestSpotifyMatch(
        accountId,
        trackName,
        artistName,
      );
      return match;
    } catch (e) {
      return null;
    }
  })();
  _resolveCache.set(key, p);
  return p;
}

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

function sanitizeSeedInput(s) {
  if (!s) return "";
  // remove parentheticals like (Ao Vivo), (Live), (Remastered)
  let out = String(s).replace(/\([^)]*\)/g, "");
  // remove trailing separators and parts like " - Live" or " – Ao Vivo"
  out = out.replace(/\s*[-–—].*$/g, "");
  // remove common live markers and variants
  out = out.replace(/\b(ao vivo|aovivo|live)\b/gi, "");
  // remove featuring qualifiers and anything after (feat, ft, featuring)
  out = out.replace(/\b(feat\.?|ft\.?|featuring)\b.*$/gi, "");
  // collapse whitespace and trim
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

async function findBestSpotifyMatch(accountId, trackName, artistName) {
  const logger = require("../../../lib/logger");
  logger.info(
    `[LastfmResolver] findBestSpotifyMatch track="${trackName}" artist="${artistName}" account=${accountId}`,
  );
  // Search Spotify by track + artist exact first
  const q = `track:"${trackName}" artist:"${artistName}"`;
  const params = new URLSearchParams({ q, type: "track", limit: "10" });
  let res = await spotifyFetch(
    accountId,
    `https://api.spotify.com/v1/search?${params.toString()}`,
  );
  if (!res || !res.ok) {
    // try looser query (track only)
    const q2 = `track:"${trackName}"`;
    const params2 = new URLSearchParams({ q: q2, type: "track", limit: "10" });
    res = await spotifyFetch(
      accountId,
      `https://api.spotify.com/v1/search?${params2.toString()}`,
    );
    if (!res || !res.ok) return null;
  }
  const data = await res.json();
  const items = (data && data.tracks && data.tracks.items) || [];
  logger.info(
    `[LastfmResolver] spotify search results count=${items.length} for track="${trackName}" artist="${artistName}"`,
  );
  if (!items.length) return null;

  const targetArtistNorm = normalizeName(artistName);

  // Heuristic: penalize live/remix/remaster versions so the studio original
  // is preferred when popularity is no longer available from the API.
  const LIVE_RE =
    /\b(ao vivo|aovivo|live|remix|remaster(?:ed)?|acoustic|cover|edit|demo|instrumental)\b/i;
  function versionPenalty(name) {
    return LIVE_RE.test(name || "") ? 1 : 0;
  }

  // Score: lower = better.
  // Primary: version penalty (0 = clean, 1 = live/remix/etc.)
  // Secondary: position in Spotify's relevance-ranked results
  function score(item, index) {
    return versionPenalty(item.name) * 100 + index;
  }

  // Filter items where any artist matches normalized artist name
  const exactMatches = items
    .map((it, idx) => ({ it, idx }))
    .filter(({ it }) => {
      const artistNames = (it.artists || []).map((a) => normalizeName(a.name));
      return artistNames.includes(targetArtistNorm);
    });

  if (exactMatches.length > 0) {
    exactMatches.sort((a, b) => score(a.it, a.idx) - score(b.it, b.idx));
    const best = exactMatches[0].it;
    logger.info(
      `[LastfmResolver] found ${exactMatches.length} exact matches, selected by relevance+version (pos=${exactMatches[0].idx} penalty=${versionPenalty(best.name)}) for track="${trackName}" artist="${artistName}"`,
    );
    return best;
  }

  logger.info(
    `[LastfmResolver] no exact artist match; selecting by relevance+version for track="${trackName}" artist="${artistName}"`,
  );

  // No exact artist match: pick best by relevance position + version penalty
  const ranked = items.map((it, idx) => ({ it, idx }));
  ranked.sort((a, b) => score(a.it, a.idx) - score(b.it, b.idx));
  return ranked[0].it;
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
  sanitizeSeedInput,
  findBestSpotifyMatch,
  resolveCandidatesToSpotify,
  generateCandidatesFromSeed,
};

// Ensure process-lifetime helpers are exported (avoid earlier overwrite issues)
module.exports.resolveToSpotifyCached = resolveToSpotifyCached;

/**
 * Collect raw Last.fm candidates for multiple seeds without resolving to Spotify.
 * seeds: array of {name, artist}
 * opts: { limit, concurrency }
 * returns: array of { name, artist, match, seedName, seedArtist }
 */
async function collectCandidatesFromSeeds(seeds = [], opts = {}) {
  const limit = opts.limit || 8;
  const concurrency = opts.concurrency || 4;
  const out = [];

  function chunk(arr, n) {
    const r = [];
    for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n));
    return r;
  }

  const batches = chunk(seeds, concurrency);
  for (const batch of batches) {
    const promises = batch.map(async (s) => {
      try {
        const t = await getSimilarTracks(s.name, s.artist, limit);
        if (Array.isArray(t) && t.length) {
          return t.map((c) => ({
            ...c,
            seedName: s.name,
            seedArtist: s.artist,
          }));
        }
        // fallback to artist top tracks
        const a = await getArtistTopTracks(s.artist, limit);
        if (Array.isArray(a) && a.length) {
          return a.map((c) => ({
            ...c,
            seedName: s.name,
            seedArtist: s.artist,
          }));
        }
        return [];
      } catch (e) {
        return [];
      }
    });

    const results = await Promise.all(promises);
    for (const r of results) {
      if (Array.isArray(r) && r.length) out.push(...r);
    }
    // small delay between batches to avoid bursts
    await new Promise((res) => setTimeout(res, 80));
  }

  return out;
}

module.exports.collectCandidatesFromSeeds = collectCandidatesFromSeeds;
