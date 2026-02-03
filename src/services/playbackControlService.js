const { spotifyFetch } = require("./spotifyService");
const { withRetry } = require("../utils/retry");
const { prisma } = require("./spotifyService");

/**
 * Playback Control Service
 * Provides functions to control Spotify playback for users
 * Requires user-modify-playback-state scope
 */

/**
 * Get user's Spotify account ID
 */
async function getUserSpotifyAccount(userId) {
  if (!userId) throw new Error("userId required");

  const account = await prisma.spotifyAccount.findFirst({
    where: { userId },
  });

  if (!account) {
    throw new Error(`No Spotify account found for user ${userId}`);
  }

  return account;
}

/**
 * Start/resume playback
 * @param {string} userId - User ID
 * @param {string[]} uris - Optional array of track URIs to play
 * @param {number} positionMs - Optional starting position in milliseconds
 * @param {string} contextUri - Optional context (album, playlist) to play
 * @param {string} deviceId - Optional device ID to play on
 */
async function playTrack(
  userId,
  { uris = [], positionMs = 0, contextUri = null, deviceId = null } = {},
) {
  const account = await getUserSpotifyAccount(userId);

  const url = deviceId
    ? `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`
    : `https://api.spotify.com/v1/me/player/play`;

  const body = {};
  if (contextUri) {
    body.context_uri = contextUri;
  } else if (uris && uris.length > 0) {
    body.uris = uris;
  }

  if (positionMs > 0) {
    body.position_ms = positionMs;
  }

  const res = await withRetry(
    () =>
      spotifyFetch(account.id, url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    { retries: 2, minDelay: 300 },
  );

  if (!res) throw new Error("No response from spotifyFetch");
  if (res.status === 204 || res.status === 200) {
    return { success: true };
  }

  const text = await res.text().catch(() => null);

  // Handle specific errors
  if (res.status === 404) {
    return {
      success: false,
      error: "NO_ACTIVE_DEVICE",
      message:
        "Nenhum dispositivo Spotify ativo encontrado. Por favor, abra o Spotify em qualquer dispositivo.",
    };
  }

  if (res.status === 403) {
    return {
      success: false,
      error: "FORBIDDEN",
      message:
        "Você precisa ter uma conta Spotify Premium para usar este recurso.",
    };
  }

  return { success: false, error: text || `HTTP ${res.status}` };
}

/**
 * Pause playback
 */
async function pausePlayback(userId, deviceId = null) {
  const account = await getUserSpotifyAccount(userId);

  const url = deviceId
    ? `https://api.spotify.com/v1/me/player/pause?device_id=${encodeURIComponent(deviceId)}`
    : `https://api.spotify.com/v1/me/player/pause`;

  const res = await withRetry(
    () =>
      spotifyFetch(account.id, url, {
        method: "PUT",
      }),
    { retries: 2, minDelay: 300 },
  );

  if (!res) throw new Error("No response from spotifyFetch");
  if (res.status === 204 || res.status === 200) {
    return { success: true };
  }

  const text = await res.text().catch(() => null);

  if (res.status === 404) {
    return {
      success: false,
      error: "NO_ACTIVE_DEVICE",
      message: "Nenhum dispositivo Spotify ativo encontrado.",
    };
  }

  return { success: false, error: text || `HTTP ${res.status}` };
}

/**
 * Resume playback (without changing track)
 */
async function resumePlayback(userId, deviceId = null) {
  const account = await getUserSpotifyAccount(userId);

  const url = deviceId
    ? `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`
    : `https://api.spotify.com/v1/me/player/play`;

  const res = await withRetry(
    () =>
      spotifyFetch(account.id, url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    { retries: 2, minDelay: 300 },
  );

  if (!res) throw new Error("No response from spotifyFetch");
  if (res.status === 204 || res.status === 200) {
    return { success: true };
  }

  const text = await res.text().catch(() => null);
  return { success: false, error: text || `HTTP ${res.status}` };
}

/**
 * Seek to specific position in current track
 */
async function seekToPosition(userId, positionMs, deviceId = null) {
  const account = await getUserSpotifyAccount(userId);

  if (positionMs < 0) {
    throw new Error("positionMs must be >= 0");
  }

  let url = `https://api.spotify.com/v1/me/player/seek?position_ms=${positionMs}`;
  if (deviceId) {
    url += `&device_id=${encodeURIComponent(deviceId)}`;
  }

  const res = await withRetry(
    () =>
      spotifyFetch(account.id, url, {
        method: "PUT",
      }),
    { retries: 2, minDelay: 300 },
  );

  if (!res) throw new Error("No response from spotifyFetch");
  if (res.status === 204 || res.status === 200) {
    return { success: true };
  }

  const text = await res.text().catch(() => null);
  return { success: false, error: text || `HTTP ${res.status}` };
}

/**
 * Skip to next track
 */
async function skipToNext(userId, deviceId = null) {
  const account = await getUserSpotifyAccount(userId);

  const url = deviceId
    ? `https://api.spotify.com/v1/me/player/next?device_id=${encodeURIComponent(deviceId)}`
    : `https://api.spotify.com/v1/me/player/next`;

  const res = await withRetry(
    () =>
      spotifyFetch(account.id, url, {
        method: "POST",
      }),
    { retries: 2, minDelay: 300 },
  );

  if (!res) throw new Error("No response from spotifyFetch");
  if (res.status === 204 || res.status === 200) {
    return { success: true };
  }

  const text = await res.text().catch(() => null);
  return { success: false, error: text || `HTTP ${res.status}` };
}

/**
 * Skip to previous track
 */
async function skipToPrevious(userId, deviceId = null) {
  const account = await getUserSpotifyAccount(userId);

  const url = deviceId
    ? `https://api.spotify.com/v1/me/player/previous?device_id=${encodeURIComponent(deviceId)}`
    : `https://api.spotify.com/v1/me/player/previous`;

  const res = await withRetry(
    () =>
      spotifyFetch(account.id, url, {
        method: "POST",
      }),
    { retries: 2, minDelay: 300 },
  );

  if (!res) throw new Error("No response from spotifyFetch");
  if (res.status === 204 || res.status === 200) {
    return { success: true };
  }

  const text = await res.text().catch(() => null);
  return { success: false, error: text || `HTTP ${res.status}` };
}

/**
 * Synchronize user's playback to match a specific state
 * Combines play + seek operations
 */
async function syncPlayback(
  userId,
  { trackUri, positionMs, isPlaying, deviceId = null },
) {
  try {
    // First, start playing the track
    if (trackUri) {
      const playResult = await playTrack(userId, {
        uris: [trackUri],
        positionMs: positionMs || 0,
        deviceId,
      });

      if (!playResult.success) {
        return playResult;
      }

      // Small delay to let Spotify process the play command
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Then handle play/pause state
    if (isPlaying === false) {
      const pauseResult = await pausePlayback(userId, deviceId);
      if (!pauseResult.success) {
        return pauseResult;
      }
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  playTrack,
  pausePlayback,
  resumePlayback,
  seekToPosition,
  skipToNext,
  skipToPrevious,
  syncPlayback,
  getUserSpotifyAccount,
};
