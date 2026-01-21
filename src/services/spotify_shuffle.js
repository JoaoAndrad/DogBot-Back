const { fetchPlaylistTrackIds } = require("../domains/spotify/playlist");
const { getRecommendations } = require("../domains/spotify/recommendations");
const { filterExistingTracks } = require("../domains/spotify/filter");
const { queueTracksSequential, startPlayback } = require("./player");

/**
 * Orchestrator to play/queue random unique tracks (not present in playlist)
 * options: { deviceId, playNow: boolean, limit: number, seeds }
 */
async function playRandomUnique(accountId, playlistId, options = {}) {
  const deviceId = options.deviceId || null;
  const playNow = options.playNow === true;
  const limit = typeof options.limit === "number" ? options.limit : 6;

  // 1) fetch playlist existing ids/uris
  const playlistSet = await fetchPlaylistTrackIds(accountId, playlistId);

  // 2) build seed strategy
  const fallbackGenres = ["pop", "rock", "electronic", "hip-hop", "indie"];
  const seeds = options.seeds || {
    seed_genres: [
      fallbackGenres[Math.floor(Math.random() * fallbackGenres.length)],
    ],
  };

  // 3) fetch candidate recommendations
  // request more than needed to allow filtering
  const requested = Math.max(limit * 2, 20);
  let candidates = [];
  try {
    candidates = await getRecommendations(accountId, seeds, requested);
  } catch (e) {
    return { success: false, error: e.message };
  }

  // 4) filter existing tracks
  let unique = filterExistingTracks(candidates, playlistSet);

  // If none left, try a different genre seed and one more attempt
  if (!unique || unique.length === 0) {
    const altSeed = {
      seed_genres: [
        fallbackGenres[Math.floor(Math.random() * fallbackGenres.length)],
      ],
    };
    try {
      const alt = await getRecommendations(accountId, altSeed, requested);
      unique = filterExistingTracks(alt, playlistSet);
    } catch (e) {
      // ignore second attempt error
    }
  }

  if (!unique || unique.length === 0) {
    return { success: false, error: "No unique candidates found" };
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
