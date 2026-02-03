const { fetchAndPersistUser, isSpotifyBlocked } = require("./spotifyService");
const jamService = require("./jamService");
const sseHub = require("../lib/sseHub");

class SpotifyMonitor {
  constructor({ userSpotifyAPI, intervalMs = 30000, concurrency = 5 } = {}) {
    if (!userSpotifyAPI) throw new Error("userSpotifyAPI is required");
    this.userSpotifyAPI = userSpotifyAPI;
    this.normalIntervalMs = intervalMs; // 30s for normal users
    this.fastIntervalMs = 5000; // 5s for users in active jams
    this.concurrency = concurrency;

    this._normalTimer = null;
    this._fastTimer = null;
    this.isRunning = false;
    this.lastRun = null;
    this.consecutiveErrors = {};

    // Track which users should be monitored at fast interval
    this.fastTrackUsers = new Set(); // userId in active jams with listeners

    // Cache last printed log per user to avoid duplicate console lines
    this._lastPrinted = new Map();
    // Cache last known state for jam hosts to detect changes
    this._lastJamState = new Map();
  }

  /**
   * Categorize users into fast/normal track based on jam state
   * Fast track: hosts and listeners of jams with 2+ people AND playing
   * Normal track: everyone else
   */
  async _categorizeUsers() {
    try {
      const newFastTrack = new Set();

      // Get all active jams
      const jamsResult = await jamService.getActiveJams(null, false); // Don't fetch playback here
      if (!jamsResult.success || !jamsResult.jams) {
        return;
      }

      for (const jam of jamsResult.jams) {
        const activeListeners = jam.listeners?.filter((l) => l.isActive) || [];
        const totalPeople = activeListeners.length + 1; // +1 for host

        // Only fast track if 2+ people AND jam is playing
        if (totalPeople >= 2 && jam.isPlaying) {
          // Add host
          newFastTrack.add(jam.hostUserId);

          // Add all active listeners
          for (const listener of activeListeners) {
            newFastTrack.add(listener.userId);
          }
        }
      }

      // Update fast track set
      const added = [...newFastTrack].filter(
        (u) => !this.fastTrackUsers.has(u),
      );
      const removed = [...this.fastTrackUsers].filter(
        (u) => !newFastTrack.has(u),
      );

      if (added.length > 0) {
        console.log(`[SpotifyMonitor] Fast track added: ${added.length} users`);
      }
      if (removed.length > 0) {
        console.log(
          `[SpotifyMonitor] Fast track removed: ${removed.length} users`,
        );
      }

      this.fastTrackUsers = newFastTrack;
    } catch (err) {
      console.error("[SpotifyMonitor] Error categorizing users:", err);
    }
  }

  async _checkOne(userId, accountId = null) {
    try {
      const res = await fetchAndPersistUser({
        accountId,
        userId,
        userSpotifyAPI: this.userSpotifyAPI,
      });

      // Check if user is a jam host and handle synchronization
      if (res && res.status === "playing" && res.track) {
        await this._handleJamSync(userId, res.track);

        // Additionally: if this user is a listener in a jam and is playing a different track
        // than the jam host, force a sync to the host state.
        try {
          const userJamResult = await jamService.getUserActiveJam(userId);
          if (userJamResult.success && userJamResult.role === "listener") {
            const jam = userJamResult.jam;
            if (jam && jam.isActive) {
              const listenerTrackId =
                (res.track && (res.track.url || res.track.id)) || null;
              const jamTrackUri =
                jam.currentTrackUri || jam.currentTrackUrl || null;
              const jamTrackId = jamTrackUri
                ? String(jamTrackUri).split("/").pop()
                : jam.currentTrackId;

              // Normalize possible ids
              // Normalize possible ids (strip URIs/URLs to plain id)
              const normalizeId = (v) => {
                if (!v) return null;
                let s = String(v).trim();
                // spotify:track:ID
                const uriMatch = s.match(/spotify:track:([A-Za-z0-9]+)/i);
                if (uriMatch) return uriMatch[1];
                // https://open.spotify.com/track/ID or with query params
                try {
                  const url = new URL(s);
                  const parts = url.pathname.split("/").filter(Boolean);
                  if (parts.length) return parts[parts.length - 1];
                } catch (e) {
                  // not a URL
                }
                // fallback: last path segment after slash
                const seg = s.split("/").pop();
                // strip query params if present
                return seg ? seg.split(/[?#]/)[0] : s;
              };

              const lId = normalizeId(listenerTrackId);
              const jId = normalizeId(jamTrackId);

              if (jId && lId && lId !== jId) {
                console.log(
                  `[SpotifyMonitor] Listener ${userId} playing different track (${lId}) than jam ${jam.id} host (${jId}), forcing sync...`,
                );
                try {
                  const syncRes = await jamService.syncListener(jam.id, userId);
                  if (syncRes && syncRes.success) {
                    console.log(
                      `[SpotifyMonitor] Forced sync succeeded for listener ${userId} to jam ${jam.id}`,
                    );
                  } else {
                    console.warn(
                      `[SpotifyMonitor] Forced sync failed for listener ${userId}:`,
                      syncRes && syncRes.error,
                    );
                  }
                } catch (e) {
                  console.error(
                    `[SpotifyMonitor] Error forcing sync for listener ${userId}:`,
                    e,
                  );
                }
              }
            }
          }
        } catch (e) {
          console.error(
            "[SpotifyMonitor] Error checking listener jam state:",
            e,
          );
        }
      }

      return { userId, ok: true, res };
    } catch (err) {
      this.consecutiveErrors[userId] =
        (this.consecutiveErrors[userId] || 0) + 1;
      return { userId, ok: false, error: err.message };
    }
  }

  /**
   * Handle jam synchronization for a user
   * Checks if user is hosting a jam and syncs listeners if track changed
   */
  async _handleJamSync(userId, currentTrack) {
    try {
      // Check if user is hosting an active jam
      const userJamResult = await jamService.getUserActiveJam(userId);

      if (!userJamResult.success || userJamResult.role !== "host") {
        return; // Not a host, nothing to do
      }

      const jam = userJamResult.jam;
      if (!jam || !jam.isActive) {
        return;
      }

      // Get last known state for this jam
      const lastState = this._lastJamState.get(jam.id);

      // Build current state
      const currentState = {
        trackId: currentTrack.id || currentTrack.trackId,
        trackUri: currentTrack.url,
        trackAlbum: currentTrack.album || currentTrack.trackAlbum || null,
        isPlaying: currentTrack.playing !== false,
        progressMs: currentTrack.progress_ms || 0,
      };

      // Check if state changed significantly
      const hasChanged =
        !lastState ||
        lastState.trackId !== currentState.trackId ||
        lastState.isPlaying !== currentState.isPlaying;

      if (hasChanged) {
        console.log(
          `[SpotifyMonitor] Jam ${jam.id} host track changed, syncing listeners...`,
        );

        // Update jam state in database
        // normalize track id before persisting
        const normalizeId = (v) => {
          if (!v) return null;
          let s = String(v).trim();
          const uriMatch = s.match(/spotify:track:([A-Za-z0-9]+)/i);
          if (uriMatch) return uriMatch[1];
          try {
            const url = new URL(s);
            const parts = url.pathname.split("/").filter(Boolean);
            if (parts.length) return parts[parts.length - 1];
          } catch (e) {}
          const seg = s.split("/").pop();
          return seg ? seg.split(/[?#]/)[0] : s;
        };

        const normalizedTrackId = normalizeId(
          currentState.trackId || currentState.trackUri,
        );

        await jamService.updateJamPlayback(jam.id, {
          id: normalizedTrackId,
          url: currentState.trackUri,
          name: currentTrack.name || currentTrack.trackName,
          album: currentState.trackAlbum,
          artists: currentTrack.artists || [],
          progress_ms: currentState.progressMs,
          playing: currentState.isPlaying,
        });

        // Sync all listeners (async, don't wait)
        jamService.syncAllListeners(jam.id).catch((err) => {
          console.error(
            `[SpotifyMonitor] Error syncing listeners for jam ${jam.id}:`,
            err,
          );
        });

        // Send SSE event to notify clients
        // sseHub exposes sendEvent(eventName, data)
        sseHub.sendEvent("jam:track-change", {
          jamId: jam.id,
          trackId: currentState.trackId,
          trackUri: currentState.trackUri,
          trackName: currentTrack.name || currentTrack.trackName,
          album: currentState.trackAlbum,
          artists: currentTrack.artists || [],
          isPlaying: currentState.isPlaying,
          progressMs: currentState.progressMs,
        });

        // Update cache
        this._lastJamState.set(jam.id, currentState);
      }
    } catch (err) {
      console.error("[SpotifyMonitor] Error in jam sync:", err);
    }
  }

  // Simple concurrency limiter using chunks
  async _runFastTrack() {
    // Check if Spotify is globally blocked
    const blockStatus = await isSpotifyBlocked();
    if (blockStatus.blocked) {
      return { processed: 0, skipped: true, reason: "spotify_blocked" };
    }

    const fastUsers = Array.from(this.fastTrackUsers);
    if (fastUsers.length === 0) {
      return { processed: 0 };
    }

    const chunkSize = Math.max(1, this.concurrency);
    let processed = 0;

    for (let i = 0; i < fastUsers.length; i += chunkSize) {
      const chunk = fastUsers.slice(i, i + chunkSize);
      const promises = chunk.map((userId) => this._checkOne(userId));
      await Promise.all(promises);
      processed += chunk.length;
    }

    return { processed, type: "fast" };
  }

  // Simple concurrency limiter using chunks
  async _runNormalTrack() {
    // Recategorize users at each normal track cycle
    await this._categorizeUsers();

    // Check if Spotify is globally blocked; if so, skip cycle
    const blockStatus = await isSpotifyBlocked();
    if (blockStatus.blocked) {
      // Suppress spam: log once per block window (track last logged blockedUntil)
      if (
        !this._lastBlockedUntil ||
        this._lastBlockedUntil !== blockStatus.blockedUntil
      ) {
        console.log(
          `[SpotifyMonitor] skipping cycle — Spotify bloqueado até ${new Date(
            blockStatus.blockedUntil,
          ).toLocaleString("pt-BR")}`,
        );
        this._lastBlockedUntil = blockStatus.blockedUntil;
      }
      return { processed: 0, skipped: true, reason: "spotify_blocked" };
    }
    this._lastBlockedUntil = null; // reset when unblocked

    const connected = await Promise.resolve(
      this.userSpotifyAPI.getConnectedUsers(),
    );

    // Filter out fast track users - they're handled by fast interval
    const normalUsers = (connected || []).filter(
      (u) => !this.fastTrackUsers.has(u),
    );

    // Suppress verbose connected-users log to avoid leaking user ids in logs
    // and reduce noise. Keep a lightweight status check instead.
    if (!normalUsers || normalUsers.length === 0)
      return { processed: 0, type: "normal" };

    this.lastRun = new Date();

    const chunkSize = Math.max(1, this.concurrency);
    let processed = 0;

    for (let i = 0; i < (normalUsers.length || 0); i += chunkSize) {
      const chunk = normalUsers.slice(i, i + chunkSize);
      const promises = chunk.map((userId) => this._checkOne(userId));
      const results = await Promise.all(promises);
      processed += results.length;

      // Log playing tracks per chunk
      const playing = results.filter(
        (r) => r.ok && r.res && r.res.status === "playing",
      );
      if (playing.length === 0) {
        // If none playing in this chunk, continue — we'll aggregate later
      } else {
        // fetch display names for playing users (best-effort)
        await Promise.all(
          playing.map(async (p) => {
            const userId = p.userId;
            const track = p.res.track || {};
            let display = userId;
            try {
              if (this.userSpotifyAPI.getUserProfile) {
                const profile = await this.userSpotifyAPI
                  .getUserProfile(userId)
                  .catch(() => null);
                if (profile && profile.displayName)
                  display = profile.displayName;
              }
            } catch (e) {
              // ignore
            }
            const trackTitle = track.name || track.trackName || "Unknown track";
            const trackId = track.id || track.trackId || "unknown";
            const line = `${display} (${userId}) — ${trackTitle} (${trackId})`;
            const prev = this._lastPrinted.get(userId);
            if (prev !== line) {
              console.log(`[SpotifyMonitor] ${line}`);
              this._lastPrinted.set(userId, line);
            }
          }),
        );
      }
    }

    // If nothing was logged as playing across all chunks, print a single message
    // (quick check: run through all users results by forcing a fresh check would be expensive here,
    // so instead rely on the last run's state via consecutiveErrors and processed count.)
    // To fulfill the requirement, if processed > 0 and no active plays were printed above,
    // print the message. Note: we can't know globally here without extra state, so approximate by
    // checking if there were any successes with playing status in a fresh quick pass.
    // Perform a lightweight pass to detect any currently playing users (non-persisting).
    let anyPlaying = false;
    for (const userId of normalUsers || []) {
      try {
        const peek = (await this.userSpotifyAPI.getCurrentlyPlaying)
          ? await this.userSpotifyAPI.getCurrentlyPlaying(userId)
          : null;
        if (peek && peek.playing) {
          anyPlaying = true;
          break;
        }
      } catch (e) {
        // ignore
      }
    }
    if (!anyPlaying && normalUsers.length > 0) {
      console.log(
        "[SpotifyMonitor] nenhum usuário está ouvindo musica no momento (normal track)",
      );
    }

    return { processed, type: "normal" };
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Initial categorization
    this._categorizeUsers().catch((e) =>
      console.log("[SpotifyMonitor] initial categorization failed", e),
    );

    // Start fast track timer (5s)
    this._fastTimer = setInterval(() => {
      this._runFastTrack().catch((e) =>
        console.log("[SpotifyMonitor] fast track run failed", e),
      );
    }, this.fastIntervalMs);

    // Start normal track timer (30s) with immediate run
    this._runNormalTrack().catch((e) =>
      console.log("[SpotifyMonitor] initial normal run failed", e),
    );
    this._normalTimer = setInterval(() => {
      this._runNormalTrack().catch((e) =>
        console.log("[SpotifyMonitor] normal track run failed", e),
      );
    }, this.normalIntervalMs);

    console.log(
      `[SpotifyMonitor] started — fast: ${this.fastIntervalMs}ms, normal: ${this.normalIntervalMs}ms`,
    );
  }

  stop() {
    if (!this.isRunning) return;
    clearInterval(this._fastTimer);
    clearInterval(this._normalTimer);
    this._fastTimer = null;
    this._normalTimer = null;
    this.isRunning = false;
    console.log("[SpotifyMonitor] stopped");
  }

  async forceCheckAll() {
    await this._runFastTrack();
    return this._runNormalTrack();
  }

  async getStats() {
    const connected = await Promise.resolve(
      this.userSpotifyAPI.getConnectedUsers(),
    );
    return {
      isRunning: this.isRunning,
      fastIntervalMs: this.fastIntervalMs,
      normalIntervalMs: this.normalIntervalMs,
      lastRun: this.lastRun,
      connectedCount: connected ? connected.length : 0,
      fastTrackCount: this.fastTrackUsers.size,
      consecutiveErrors: this.consecutiveErrors,
    };
  }
}

module.exports = SpotifyMonitor;
