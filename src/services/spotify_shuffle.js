const { fetchPlaylistTrackIds } = require("../domains/spotify/playlist");
const { filterExistingTracks } = require("../domains/spotify/filter");
const { queueTracksSequential, startPlayback } = require("./player");
const {
  generateCandidatesFromSeed,
} = require("../domains/spotify/lastfm/lastfmResolver");

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

  // sample up to 3 seeds randomly from playlist
  const seedCount = Math.min(3, Math.max(1, Math.floor(tracks.length / 2)));
  const seeds = [];
  const indices = new Set();
  while (indices.size < seedCount) {
    indices.add(Math.floor(Math.random() * tracks.length));
  }
  for (const i of indices) {
    const t = tracks[i];
    if (t && t.name && Array.isArray(t.artists) && t.artists.length) {
      seeds.push({ name: t.name, artist: t.artists[0] });
    }
  }
  logger.info(`[SpotifyShuffle] selected seeds=${JSON.stringify(seeds)}`);

  // 3) Use Last.fm as primary candidate generator. For each seed, ask Last.fm and resolve to Spotify.
  let resolved = [];
  try {
    for (const s of seeds) {
      logger.info(
        `[SpotifyShuffle] generating candidates for seed="${s.name}" artist="${s.artist}"`,
      );
      const r = await generateCandidatesFromSeed(accountId, s.name, s.artist, {
        limit: 8,
      });
      logger.info(
        `[SpotifyShuffle] resolved candidates for seed count=${r?.length || 0}`,
      );
      if (Array.isArray(r) && r.length)
        resolved.push(...r.map((x) => x.spotify));
    }
  } catch (e) {
    // On any resolution error fail gracefully per user requirement
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
