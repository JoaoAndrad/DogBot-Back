const { fetchPlaylistTrackIds } = require("../domains/spotify/playlist");
const { filterExistingTracks } = require("../domains/spotify/filter");
const { queueTracksSequential, startPlayback } = require("./player");
const {
  generateCandidatesFromSeed,
  sanitizeSeedInput,
  normalizeName,
} = require("../domains/spotify/lastfm/lastfmResolver");

const SEEDS_TOTAL = parseInt(process.env.SHUFFLE_SEEDS_TOTAL || "20", 10);
const LIMIT_PER_SEED = parseInt(process.env.SHUFFLE_LIMIT_PER_SEED || "25", 10);
const CONCURRENCY = parseInt(process.env.SHUFFLE_CONCURRENCY || "4", 10);
const MAX_CANDIDATES = parseInt(
  process.env.SHUFFLE_MAX_CANDIDATES || "250",
  10,
);

/**
 * Orchestrator to play/queue random unique tracks (not present in playlist)
 * options: { deviceId, playNow: boolean, limit: number, seeds }
 */
async function playRandomUnique(accountId, playlistId, options = {}) {
  const deviceId = options.deviceId || null;
  const playNow = options.playNow === true;
  const limit = typeof options.limit === "number" ? options.limit : 6;

  // 1) fetch playlist existing ids/uris
  const logger = require("../lib/logger");
  logger.info(
    `[SpotifyShuffle] playRandomUnique account=${accountId} playlist=${playlistId} options=${JSON.stringify(options)}`,
  );
  const playlistSet = await fetchPlaylistTrackIds(accountId, playlistId);
  logger.info(
    `[SpotifyShuffle] fetched playlist tracks count=${playlistSet.tracks?.length || 0}`,
  );

  // 2) build seeds from playlist tracks (use names+artists for Last.fm)
  const tracks = Array.isArray(playlistSet.tracks) ? playlistSet.tracks : [];
  if (!tracks.length)
    return {
      success: false,
      error: "Não foi possível gerar recomendações no momento",
    };

  // Build seed set using full playlist coverage:
  // - pick one representative track from top artists
  // - supplement with weighted random tracks until SEEDS_TOTAL
  const artistMap = new Map();
  for (const t of tracks) {
    if (!t || !t.name || !Array.isArray(t.artists) || !t.artists.length)
      continue;
    const artist = t.artists[0];
    if (!artist) continue;
    if (!artistMap.has(artist)) artistMap.set(artist, []);
    artistMap.get(artist).push(t);
  }

  // sort artists by number of tracks in playlist (frequency)
  const artistsSorted = Array.from(artistMap.keys()).sort((a, b) => {
    return artistMap.get(b).length - artistMap.get(a).length;
  });

  const seeds = [];
  const seenSeedKeys = new Set();

  // pick representative tracks from top artists (up to half of SEEDS_TOTAL)
  const topArtistCount = Math.min(
    Math.ceil(SEEDS_TOTAL / 2),
    artistsSorted.length,
  );
  for (let i = 0; i < topArtistCount; i++) {
    const artist = artistsSorted[i];
    const list = artistMap.get(artist) || [];
    // pick the most common / first track for that artist
    const pick = list[0];
    if (!pick) continue;
    const name = sanitizeSeedInput(pick.name || "");
    const art = sanitizeSeedInput(artist || "");
    const key = `${normalizeName(name)}||${normalizeName(art)}`;
    if (seenSeedKeys.has(key)) continue;
    seenSeedKeys.add(key);
    seeds.push({ name, artist: art });
    if (seeds.length >= SEEDS_TOTAL) break;
  }

  // supplement with weighted-random seeds from playlist until SEEDS_TOTAL
  const remaining = SEEDS_TOTAL - seeds.length;
  const shuffledIndices = Array.from(
    { length: tracks.length },
    (_, i) => i,
  ).sort(() => Math.random() - 0.5);
  for (const idx of shuffledIndices) {
    if (seeds.length >= SEEDS_TOTAL) break;
    const t = tracks[idx];
    if (!t || !t.name || !Array.isArray(t.artists) || !t.artists.length)
      continue;
    const name = sanitizeSeedInput(t.name || "");
    const art = sanitizeSeedInput(t.artists[0] || "");
    const key = `${normalizeName(name)}||${normalizeName(art)}`;
    if (seenSeedKeys.has(key)) continue;
    seenSeedKeys.add(key);
    seeds.push({ name, artist: art });
  }

  logger.info(`[SpotifyShuffle] selected seeds count=${seeds.length}`);

  // 3) Use Last.fm as primary candidate generator with controlled concurrency.
  let resolved = [];
  try {
    // build a normalized set of playlist name|artist to filter by metadata
    const playlistNormalized = new Set();
    for (const t of tracks) {
      const nm = sanitizeSeedInput(t.name || "");
      const art = sanitizeSeedInput(
        (Array.isArray(t.artists) && t.artists[0]) || "",
      );
      const key = `${normalizeName(nm)}||${normalizeName(art)}`;
      playlistNormalized.add(key);
    }

    function chunkArray(arr, size) {
      const out = [];
      for (let i = 0; i < arr.length; i += size)
        out.push(arr.slice(i, i + size));
      return out;
    }

    const batches = chunkArray(seeds, CONCURRENCY);
    const resolvedByKey = new Set();

    for (const batch of batches) {
      const promises = batch.map((s) =>
        generateCandidatesFromSeed(accountId, s.name, s.artist, {
          limit: LIMIT_PER_SEED,
        }).catch((e) => {
          logger.warn(
            `[SpotifyShuffle] seed resolution failed for "${s.name}" - ${e && e.message}`,
          );
          return [];
        }),
      );
      const results = await Promise.all(promises);
      for (const r of results) {
        if (!Array.isArray(r) || r.length === 0) continue;
        for (const item of r) {
          const sp = item && item.spotify ? item.spotify : null;
          if (!sp) continue;
          const trackName = sp.name || sp.track || "";
          const artistName =
            (sp.artists && sp.artists[0] && sp.artists[0].name) || "";
          const key = `${normalizeName(trackName)}||${normalizeName(artistName)}`;
          if (playlistNormalized.has(key)) continue; // already in playlist by metadata
          if (resolvedByKey.has(key)) continue; // already added
          resolvedByKey.add(key);
          resolved.push(sp);
          if (resolved.length >= MAX_CANDIDATES) break;
        }
        if (resolved.length >= MAX_CANDIDATES) break;
      }
      if (resolved.length >= MAX_CANDIDATES) break;
      // tiny delay between batches could be added here in future for backoff
    }
  } catch (e) {
    logger.error(
      "[SpotifyShuffle] error generating candidates:",
      e && e.message ? e.message : e,
    );
    return {
      success: false,
      error: "Não foi possível gerar recomendações no momento",
    };
  }

  logger.info(
    `[SpotifyShuffle] total resolved spotify candidates=${resolved.length}`,
  );

  if (!resolved || resolved.length === 0) {
    logger.info("[SpotifyShuffle] no resolved candidates found");
    return {
      success: false,
      error: "Não foi possível gerar recomendações no momento",
    };
  }

  // 4) filter existing tracks
  let unique = filterExistingTracks(resolved, playlistSet);

  logger.info(
    `[SpotifyShuffle] unique candidates after filtering=${unique.length}`,
  );

  if (!unique || unique.length === 0) {
    return {
      success: false,
      error: "Não foi possível gerar recomendações no momento",
    };
  }

  // Limit to requested number
  unique = unique.slice(0, limit);

  const uris = unique
    .map((t) => (t.uri ? t.uri : t.id ? `spotify:track:${t.id}` : null))
    .filter(Boolean);

  if (uris.length === 0) return { success: false, error: "No playable URIs" };

  // If playNow, start playback with first track and queue the rest; otherwise queue all
  if (playNow) {
    const first = uris.slice(0, 1);
    const rest = uris.slice(1);
    const startRes = await startPlayback(accountId, first, deviceId).catch(
      (e) => ({ success: false, error: e.message }),
    );
    let queueRes = [];
    if (rest.length)
      queueRes = await queueTracksSequential(accountId, rest, deviceId);
    return { success: true, started: startRes, queued: queueRes };
  }

  const queued = await queueTracksSequential(accountId, uris, deviceId);
  return { success: true, queued };
}

module.exports = { playRandomUnique };
