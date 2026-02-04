const { fetchPlaylistTrackIds } = require("../domains/spotify/playlist");
const { filterExistingTracks } = require("../domains/spotify/filter");
const { queueTracksSequential, startPlayback } = require("./player");
const {
  generateCandidatesFromSeed,
  sanitizeSeedInput,
  normalizeName,
} = require("../domains/spotify/lastfm/lastfmResolver");

// Improved defaults for better recommendations
const SEEDS_TOTAL = parseInt(process.env.SHUFFLE_SEEDS_TOTAL || "12", 10); // Increased from 8
const LIMIT_PER_SEED = parseInt(process.env.SHUFFLE_LIMIT_PER_SEED || "12", 10); // Increased from 8
const CONCURRENCY = parseInt(process.env.SHUFFLE_CONCURRENCY || "3", 10); // Increased from 2
const MAX_CANDIDATES = parseInt(
  process.env.SHUFFLE_MAX_CANDIDATES || "150",
  10,
); // Increased from 60
const MIN_FINAL_TRACKS = parseInt(
  process.env.SHUFFLE_MIN_FINAL_TRACKS || "30",
  10,
); // New: minimum viable tracks
const BLACKLIST_EXPIRE_DAYS = parseInt(
  process.env.BLACKLIST_EXPIRE_DAYS || "14",
  10,
); // Blacklist TTL

/**
 * Get blacklisted track IDs for a chat
 */
async function getBlacklist(chatId) {
  const { prisma } = require("./spotifyService");
  const logger = require("../lib/logger");

  try {
    const now = new Date();
    const blacklisted = await prisma.recommendationBlacklist.findMany({
      where: {
        chatId,
        expiresAt: { gt: now },
      },
      select: { trackId: true },
    });

    const trackIds = blacklisted.map((b) => b.trackId);
    logger.info(
      `[SpotifyShuffle] Loaded ${trackIds.length} blacklisted tracks for chat ${chatId}`,
    );
    return new Set(trackIds);
  } catch (err) {
    logger.error("[SpotifyShuffle] Error loading blacklist:", err);
    return new Set();
  }
}

/**
 * Add tracks to blacklist
 */
async function addToBlacklist(chatId, tracks) {
  const { prisma } = require("./spotifyService");
  const logger = require("../lib/logger");

  try {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + BLACKLIST_EXPIRE_DAYS);

    const entries = tracks.map((track) => ({
      chatId,
      trackId: track.id,
      trackName: track.name || null,
      trackArtists:
        (track.artists && track.artists.map((a) => a.name).join(", ")) || null,
      expiresAt,
    }));

    // Use createMany with skipDuplicates to avoid conflicts
    const result = await prisma.recommendationBlacklist.createMany({
      data: entries,
      skipDuplicates: true,
    });

    logger.info(
      `[SpotifyShuffle] Added ${result.count} tracks to blacklist for chat ${chatId}`,
    );
    return result.count;
  } catch (err) {
    logger.error("[SpotifyShuffle] Error adding to blacklist:", err);
    return 0;
  }
}

/**
 * Clean up expired blacklist entries
 */
async function cleanupExpiredBlacklist() {
  const { prisma } = require("./spotifyService");
  const logger = require("../lib/logger");

  try {
    const now = new Date();
    const result = await prisma.recommendationBlacklist.deleteMany({
      where: {
        expiresAt: { lte: now },
      },
    });

    if (result.count > 0) {
      logger.info(
        `[SpotifyShuffle] Cleaned up ${result.count} expired blacklist entries`,
      );
    }
    return result.count;
  } catch (err) {
    logger.error("[SpotifyShuffle] Error cleaning blacklist:", err);
    return 0;
  }
}

/**
 * Orchestrator to play/queue random unique tracks (not present in playlist)
 * options: { deviceId, playNow: boolean, limit: number, seeds, chatId }
 */
async function playRandomUnique(accountId, playlistId, options = {}) {
  const deviceId = options.deviceId || null;
  const playNow = options.playNow === true;
  const limit = typeof options.limit === "number" ? options.limit : 6;
  const chatId = options.chatId || null; // For blacklist tracking

  // 1) fetch playlist existing ids/uris
  const logger = require("../lib/logger");
  logger.info(
    `[SpotifyShuffle] playRandomUnique account=${accountId} playlist=${playlistId} options=${JSON.stringify(options)}`,
  );

  // Clean up expired blacklist entries (async, don't wait)
  if (chatId) {
    cleanupExpiredBlacklist().catch((err) =>
      logger.warn("[SpotifyShuffle] Blacklist cleanup failed:", err),
    );
  }

  // Load blacklist for this chat
  const blacklistedIds = chatId ? await getBlacklist(chatId) : new Set();

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

  // Build a normalized set of playlist name|artist for quick filtering by metadata
  const playlistNormalized = new Set();
  for (const t of tracks) {
    const nm = sanitizeSeedInput(t.name || "");
    const art = sanitizeSeedInput(
      (Array.isArray(t.artists) && t.artists[0]) || "",
    );
    const key = `${normalizeName(nm)}||${normalizeName(art)}`;
    playlistNormalized.add(key);
  }
  logger.info(
    `[SpotifyShuffle] built normalized playlist set size=${playlistNormalized.size}`,
  );

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

  // 3) Collect Last.fm candidates and resolve to Spotify with on-the-fly filtering
  // This avoids wasting API calls on tracks already in the playlist
  let resolved = [];
  try {
    const {
      collectCandidatesFromSeeds,
      resolveToSpotifyCached,
    } = require("../domains/spotify/lastfm/lastfmResolver");

    // 3a) collect Last.fm candidates for all seeds
    const rawCandidates = await collectCandidatesFromSeeds(seeds, {
      limit: LIMIT_PER_SEED,
      concurrency: CONCURRENCY,
    });
    logger.info(
      `[SpotifyShuffle] lastfm raw candidates=${rawCandidates.length}`,
    );

    // 3b) dedupe candidates by normalized name||artist and filter against playlist BEFORE resolving
    const candidateMap = new Map();
    for (const c of rawCandidates) {
      const name = sanitizeSeedInput(c.name || "");
      const artist = sanitizeSeedInput(c.artist || "");
      const key = `${normalizeName(name)}||${normalizeName(artist)}`;

      // Filter out tracks already in playlist by metadata (saves Spotify API calls)
      if (playlistNormalized.has(key)) continue;

      if (!candidateMap.has(key))
        candidateMap.set(key, { name, artist, match: c.match });
    }

    const uniqueCandidates = Array.from(candidateMap.values());
    logger.info(
      `[SpotifyShuffle] unique lastfm candidates after playlist filtering=${uniqueCandidates.length}`,
    );

    // 3c) resolve unique candidates to Spotify with controlled concurrency
    // Filter by name+artist only (Last.fm and Spotify have different IDs for same track)
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
        if (!sp || !sp.id) continue;

        // Check metadata key (name+artist) against playlist and blacklist
        const trackName = sp.name || "";
        const artistName =
          (sp.artists && sp.artists[0] && sp.artists[0].name) || "";
        const key = `${normalizeName(trackName)}||${normalizeName(artistName)}`;

        // Filter by name+artist comparison (not Spotify ID, as Last.fm and Spotify have different IDs)
        if (playlistNormalized.has(key)) continue;
        if (resolvedByKey.has(key)) continue;

        // Check if track ID is in blacklist (blacklist uses Spotify IDs from previous recommendations)
        // Even blacklisted tracks have 10% chance of being approved
        if (blacklistedIds.has(sp.id)) {
          const randomChance = Math.random();
          if (randomChance > 0.1) {
            // 90% chance: skip blacklisted track
            continue;
          }
          // 10% chance: allow blacklisted track through
          logger.info(
            `[SpotifyShuffle] Blacklisted track "${sp.name}" passed 10% random approval`,
          );
        }

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

  // 4) Final filter for any edge cases (should be minimal now since we filter during resolution)
  let unique = filterExistingTracks(resolved, playlistSet);

  // Filter out remaining blacklisted tracks with 10% approval chance
  if (blacklistedIds.size > 0) {
    const beforeBlacklist = unique.length;
    unique = unique.filter((track) => {
      if (blacklistedIds.has(track.id)) {
        const randomChance = Math.random();
        if (randomChance <= 0.1) {
          // 10% chance: keep blacklisted track
          logger.info(
            `[SpotifyShuffle] Final filter: Blacklisted track "${track.name}" passed 10% random approval`,
          );
          return true;
        }
        // 90% chance: filter out blacklisted track
        return false;
      }
      return true;
    });
    const removed = beforeBlacklist - unique.length;
    if (removed > 0) {
      logger.info(
        `[SpotifyShuffle] Filtered ${removed} remaining blacklisted tracks`,
      );
    }
  }

  logger.info(
    `[SpotifyShuffle] unique candidates after filtering=${unique.length}`,
  );

  // Check if we have minimum viable tracks
  if (unique.length < MIN_FINAL_TRACKS) {
    logger.warn(
      `[SpotifyShuffle] Only ${unique.length} unique tracks found, minimum is ${MIN_FINAL_TRACKS}. Attempting to get more...`,
    );

    // If we don't have enough, try to get more by:
    // 1. Increasing seeds and candidates dynamically
    // 2. Using more diverse seed selection
    // For now, we'll continue with what we have but log a warning
  }

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

  // Add recommended tracks to blacklist (async, don't wait)
  if (chatId && unique.length > 0) {
    addToBlacklist(chatId, unique).catch((err) =>
      logger.warn("[SpotifyShuffle] Failed to update blacklist:", err),
    );
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

/**
 * Clear blacklist for a specific chat
 */
async function clearBlacklist(chatId) {
  const { prisma } = require("./spotifyService");
  const logger = require("../lib/logger");

  try {
    const result = await prisma.recommendationBlacklist.deleteMany({
      where: { chatId },
    });

    logger.info(
      `[SpotifyShuffle] Cleared ${result.count} blacklist entries for chat ${chatId}`,
    );
    return { success: true, count: result.count };
  } catch (err) {
    logger.error("[SpotifyShuffle] Error clearing blacklist:", err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  playRandomUnique,
  clearBlacklist,
  getBlacklist,
  addToBlacklist,
  cleanupExpiredBlacklist,
};
