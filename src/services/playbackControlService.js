const { spotifyFetch } = require("./spotifyService");
const { withRetry } = require("../utils/retry");
const { prisma } = require("./spotifyService");

/**
 * Playback Control Service
 * Provides functions to control Spotify playback for users
 * Requires user-modify-playback-state scope
 */

// Device cache: { accountId: { devices: [...], cachedAt: timestamp } }
const deviceCache = new Map();
const DEVICE_CACHE_TTL = 30000; // 30 seconds

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

  // Always include position if it's a valid number (including 0)
  if (typeof positionMs === 'number' && positionMs >= 0) {
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
 * Get available Spotify devices for a user
 * @param {string} accountId - Spotify account ID
 * @param {boolean} useCache - Whether to use cached devices (default: true)
 * @returns {Promise<{success: boolean, devices?: Array, error?: string}>}
 */
async function getAvailableDevices(accountId, useCache = true) {
  try {
    // Check cache first
    if (useCache && deviceCache.has(accountId)) {
      const cached = deviceCache.get(accountId);
      const age = Date.now() - cached.cachedAt;
      if (age < DEVICE_CACHE_TTL) {
        return { success: true, devices: cached.devices };
      }
      // Cache expired, remove it
      deviceCache.delete(accountId);
    }

    const url = "https://api.spotify.com/v1/me/player/devices";
    const res = await spotifyFetch(accountId, url, { method: "GET" });

    if (!res || !res.ok) {
      return { success: false, error: "Failed to fetch devices" };
    }

    const data = await res.json();
    const devices = data.devices || [];

    // Update cache
    deviceCache.set(accountId, {
      devices,
      cachedAt: Date.now(),
    });

    return { success: true, devices };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Transfer playback to a specific device
 * @param {string} accountId - Spotify account ID
 * @param {string} deviceId - Target device ID
 * @param {boolean} play - Whether to start playing after transfer
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function transferPlayback(accountId, deviceId, play = true) {
  try {
    const url = "https://api.spotify.com/v1/me/player";
    const body = {
      device_ids: [deviceId],
      play,
    };

    const res = await spotifyFetch(accountId, url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res || (res.status !== 204 && res.status !== 200)) {
      return { success: false, error: `Transfer failed: HTTP ${res.status}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Select best device based on priority:
 * 1. Last used device (if provided and available)
 * 2. Device type priority: Smartphone > Computer > Web Player > others
 * 3. Within same type, prefer active devices
 * @param {Array} devices - Available devices
 * @param {string} lastDeviceId - Last used device ID (optional)
 * @returns {Object|null} Selected device or null
 */
function selectBestDevice(devices, lastDeviceId = null) {
  if (!devices || devices.length === 0) return null;

  // Priority 1: Check if last device is available
  if (lastDeviceId) {
    const lastDevice = devices.find((d) => d.id === lastDeviceId);
    if (lastDevice) return lastDevice;
  }

  // Priority 2: Sort by type and active state
  const typePriority = {
    Smartphone: 1,
    Computer: 2,
    "Web Player": 3,
  };

  const sortedDevices = [...devices].sort((a, b) => {
    const priorityA = typePriority[a.type] || 999;
    const priorityB = typePriority[b.type] || 999;

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // Same type, prefer active devices
    if (a.is_active && !b.is_active) return -1;
    if (!a.is_active && b.is_active) return 1;

    return 0;
  });

  return sortedDevices[0];
}

/**
 * Synchronize user's playback to match a specific state
 * Combines play + seek operations
 * @param {string} userId - User ID
 * @param {Object} options - Sync options
 * @param {string} options.trackUri - Track URI to play
 * @param {number} options.positionMs - Position in milliseconds
 * @param {boolean} options.isPlaying - Whether track should be playing
 * @param {string} options.deviceId - Optional device ID
 * @param {boolean} options.forcePlay - If true, ignores isPlaying and always leaves playing (useful for jam joins)
 */
async function syncPlayback(
  userId,
  { trackUri, positionMs, isPlaying, deviceId = null, forcePlay = false },
) {
  try {
    const account = await getUserSpotifyAccount(userId);

    // First, start playing the track
    if (trackUri) {
      let playResult = await playTrack(userId, {
        uris: [trackUri],
        positionMs: positionMs || 0,
        deviceId,
      });

      // Handle NO_ACTIVE_DEVICE with fallback (max 1 attempt)
      if (!playResult.success && playResult.error === "NO_ACTIVE_DEVICE") {
        // Try to get available devices and transfer
        const devicesResult = await getAvailableDevices(account.id);

        if (!devicesResult.success || devicesResult.devices.length === 0) {
          // No devices available, return original error
          return playResult;
        }

        // Select best device
        const targetDevice = selectBestDevice(
          devicesResult.devices,
          account.lastDeviceId,
        );
        if (!targetDevice) {
          return playResult;
        }

        // Transfer playback to selected device
        const transferResult = await transferPlayback(
          account.id,
          targetDevice.id,
          false,
        );
        if (!transferResult.success) {
          return playResult; // Transfer failed, return original error
        }

        // Wait 1 second for transfer to complete
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Retry play with selected device
        playResult = await playTrack(userId, {
          uris: [trackUri],
          positionMs: positionMs || 0,
          deviceId: targetDevice.id,
        });

        // Update lastDeviceId if successful
        if (playResult.success) {
          await prisma.spotifyAccount
            .update({
              where: { id: account.id },
              data: { lastDeviceId: targetDevice.id },
            })
            .catch(() => {}); // Silent fail on cache update
        }
      }

      if (!playResult.success) {
        return playResult;
      }

      // Small delay to let Spotify process the play command
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Then handle play/pause state
    // If forcePlay is true, skip pause logic (useful for jam joins)
    if (!forcePlay && isPlaying === false) {
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
  getAvailableDevices,
  transferPlayback,
  selectBestDevice,
};
