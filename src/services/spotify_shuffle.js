const { fetchPlaylistTrackIds } = require("../domains/spotify/playlist");
const { filterExistingTracks } = require("../domains/spotify/filter");
const { queueTracksSequential, startPlayback } = require("./player");
const {
  generateCandidatesFromSeed,
  sanitizeSeedInput,
  normalizeName,
} = require("../domains/spotify/lastfm/lastfmResolver");

// Safer defaults to avoid hitting Spotify rate limits in large playlists
const SEEDS_TOTAL = parseInt(process.env.SHUFFLE_SEEDS_TOTAL || "8", 10);
const LIMIT_PER_SEED = parseInt(process.env.SHUFFLE_LIMIT_PER_SEED || "8", 10);
const CONCURRENCY = parseInt(process.env.SHUFFLE_CONCURRENCY || "2", 10);
const MAX_CANDIDATES = parseInt(process.env.SHUFFLE_MAX_CANDIDATES || "60", 10);

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

  // 3) Collect all Last.fm candidates first, dedupe by normalized metadata,
  // then resolve unique pairs to Spotify with a cached resolver to minimize searches.
  let resolved = [];
  try {
    const {
      collectCandidatesFromSeeds,
      resolveToSpotifyCached,
    } = require("../domains/spotify/lastfm/lastfmResolver");
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

    // 3a) collect Last.fm candidates for all seeds
    const rawCandidates = await collectCandidatesFromSeeds(seeds, {
      limit: LIMIT_PER_SEED,
      concurrency: CONCURRENCY,
    });
    logger.info(
      `[SpotifyShuffle] lastfm raw candidates=${rawCandidates.length}`,
    );

    // 3b) dedupe candidates by normalized name||artist and filter against playlist
    const candidateMap = new Map();
    for (const c of rawCandidates) {
      const name = sanitizeSeedInput(c.name || "");
      const artist = sanitizeSeedInput(c.artist || "");
      const key = `${normalizeName(name)}||${normalizeName(artist)}`;
      if (playlistNormalized.has(key)) continue;
      if (!candidateMap.has(key))
        candidateMap.set(key, { name, artist, match: c.match });
    }

    const uniqueCandidates = Array.from(candidateMap.values());
    logger.info(
      `[SpotifyShuffle] unique lastfm candidates=${uniqueCandidates.length}`,
    );

    // 3c) resolve unique candidates to Spotify with controlled concurrency
    const chunkArray = (arr, size) => {
      const out = [];
      for (let i = 0; i < arr.length; i += size)
        out.push(arr.slice(i, i + size));
      return out;
    };

    const batches = chunkArray(uniqueCandidates, CONCURRENCY);
    const resolvedByKey = new Set();
    for (const batch of batches) {
      const promises = batch.map((c) =>
        resolveToSpotifyCached(accountId, c.name, c.artist).catch((e) => {
          logger.warn(
            `[SpotifyShuffle] resolve failed ${c.name} - ${e && e.message}`,
          );
          return null;
        }),
      );
      const results = await Promise.all(promises);
      for (let i = 0; i < results.length; i++) {
        const sp = results[i];
        const cand = batch[i];
        if (!sp) continue;
        const trackName = sp.name || "";
        const artistName =
          (sp.artists && sp.artists[0] && sp.artists[0].name) || "";
        const key = `${normalizeName(trackName)}||${normalizeName(artistName)}`;
        if (playlistNormalized.has(key)) continue;
        if (resolvedByKey.has(key)) continue;
        resolvedByKey.add(key);
        resolved.push(sp);
        if (resolved.length >= MAX_CANDIDATES) break;
      }
      if (resolved.length >= MAX_CANDIDATES) break;
      // small pause between resolution batches to avoid bursts
      await new Promise((r) => setTimeout(r, 250));
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

  // Note: do not truncate the final playlist here — create the playlist
  // with all unique suggestions returned by Last.fm (up to MAX_CANDIDATES).

  const uris = unique
    .map((t) => (t.uri ? t.uri : t.id ? `spotify:track:${t.id}` : null))
    .filter(Boolean);

  if (uris.length === 0) return { success: false, error: "No playable URIs" };

  // Create a private playlist for these URIs and start playback using the playlist context
  const {
    createSpotifyPlaylistForAccount,
    addTracksToPlaylistBatch,
  } = require("../services/spotifyService");

  const playlistName = `Recomendações - ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
  const desc = `Playlist gerada automaticamente com recomendações do Last.fm (${new Date().toLocaleString()})`;

  const createRes = await createSpotifyPlaylistForAccount(
    accountId,
    playlistName,
    desc,
    false,
  );
  if (!createRes || !createRes.success) {
    logger.warn(
      `[SpotifyShuffle] failed create playlist: ${createRes && createRes.error}`,
    );
    return {
      success: false,
      error: "Não foi possível criar a playlist de recomendações",
    };
  }

  const playlist = createRes.playlist;
  const createdPlaylistId = playlist.id;
  const createdPlaylistUri = playlist.uri;

  // Add tracks in batches (100 per request)
  const addRes = await addTracksToPlaylistBatch(
    createdPlaylistId,
    uris,
    accountId,
  );
  if (!addRes || !addRes.success) {
    logger.warn(
      `[SpotifyShuffle] failed adding tracks to playlist: ${addRes && addRes.error}`,
    );
    // still attempt to start playback of whatever was added
  }

  // Final log: playlist created and list added
  try {
    const addedLines = (unique || []).map((t) => {
      const artist = (t.artists && t.artists[0] && t.artists[0].name) || "";
      const name = t.name || t.uri || t.id || "<unknown>";
      return `"${name}" + "${artist}"`;
    });
    logger.info(
      `[SpotifyShuffle] Playlist: "${playlistName}" Criada id=${createdPlaylistId}`,
    );
    if (addedLines.length)
      logger.info(
        `[SpotifyShuffle] Músicas adicionadas: ${addedLines.join(", ")}`,
      );
  } catch (e) {
    // best-effort logging
    logger.warn("[SpotifyShuffle] failed to log added tracks", e && e.message);
  }

  // Start playback using playlist context URI
  if (playNow) {
    // Enable shuffle on the user's player (best-effort) before starting playback
    try {
      const { spotifyFetch } = require("../services/spotifyService");
      const shuffleUrl = `https://api.spotify.com/v1/me/player/shuffle?state=true${
        deviceId ? `&device_id=${encodeURIComponent(deviceId)}` : ""
      }`;
      // note: spotifyFetch expects accountId as first arg
      const shRes = await spotifyFetch(accountId, shuffleUrl, {
        method: "PUT",
      }).catch((e) => null);
      if (!shRes || !shRes.ok) {
        logger.warn(
          `[SpotifyShuffle] failed to enable shuffle (non-fatal): ${shRes && (shRes.status || shRes.blockedHeader)}`,
        );
      }
    } catch (e) {
      logger.warn(`[SpotifyShuffle] enable shuffle failed: ${e && e.message}`);
    }

    const startRes = await startPlayback(
      accountId,
      [],
      deviceId,
      createdPlaylistUri,
    ).catch((e) => ({ success: false, error: e.message }));
    return {
      success: true,
      playlist: { id: createdPlaylistId, uri: createdPlaylistUri },
      started: startRes,
    };
  }

  // If not playNow, just return the playlist created
  return {
    success: true,
    playlist: { id: createdPlaylistId, uri: createdPlaylistUri },
  };
}

module.exports = { playRandomUnique };
