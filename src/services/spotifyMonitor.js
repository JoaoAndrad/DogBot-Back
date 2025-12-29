const { fetchAndPersistUser } = require("./spotifyService");

class SpotifyMonitor {
  constructor({ userSpotifyAPI, intervalMs = 10000, concurrency = 5 } = {}) {
    if (!userSpotifyAPI) throw new Error("userSpotifyAPI is required");
    this.userSpotifyAPI = userSpotifyAPI;
    this.intervalMs = intervalMs;
    this.concurrency = concurrency;

    this._timer = null;
    this.isRunning = false;
    this.lastRun = null;
    this.consecutiveErrors = {};
  }

  async _checkOne(userId, accountId = null) {
    try {
      const res = await fetchAndPersistUser({
        accountId,
        userId,
        userSpotifyAPI: this.userSpotifyAPI,
      });
      return { userId, ok: true, res };
    } catch (err) {
      this.consecutiveErrors[userId] =
        (this.consecutiveErrors[userId] || 0) + 1;
      return { userId, ok: false, error: err.message };
    }
  }

  // Simple concurrency limiter using chunks
  async _runOnce() {
    const connected = this.userSpotifyAPI.getConnectedUsers();
    console.log(
      "[SpotifyMonitor] Usuários conectados ao spotify:",
      connected && connected.length ? connected.join(", ") : "nenhum"
    );
    console.log("[SpotifyMonitor] Verificando músicas atuais dos usuários...");
    if (!connected || connected.length === 0) return { processed: 0 };

    this.lastRun = new Date();

    const chunkSize = Math.max(1, this.concurrency);
    let processed = 0;

    for (let i = 0; i < connected.length; i += chunkSize) {
      const chunk = connected.slice(i, i + chunkSize);
      const promises = chunk.map((userId) => this._checkOne(userId));
      const results = await Promise.all(promises);
      processed += results.length;

      // Log playing tracks per chunk
      const playing = results.filter(
        (r) => r.ok && r.res && r.res.status === "playing"
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
            console.log(
              `[SpotifyMonitor] ${
                track.name || track.trackName || "Unknown track"
              } — ${display}`
            );
          })
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
    for (const userId of connected) {
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
    if (!anyPlaying) {
      console.log(
        "[SpotifyMonitor] nenhum usuário está ouvindo musica no momento"
      );
    }

    return { processed };
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    // immediate run
    this._runOnce().catch((e) =>
      console.error("spotifyMonitor initial run failed", e)
    );
    this._timer = setInterval(() => {
      this._runOnce().catch((e) =>
        console.error("spotifyMonitor run failed", e)
      );
    }, this.intervalMs);
    console.log("[SpotifyMonitor] started — interval:", this.intervalMs);
  }

  stop() {
    if (!this.isRunning) return;
    clearInterval(this._timer);
    this._timer = null;
    this.isRunning = false;
    console.log("[SpotifyMonitor] stopped");
  }

  async forceCheckAll() {
    return this._runOnce();
  }

  getStats() {
    const connected = this.userSpotifyAPI.getConnectedUsers();
    return {
      isRunning: this.isRunning,
      intervalMs: this.intervalMs,
      lastRun: this.lastRun,
      connectedCount: connected ? connected.length : 0,
      consecutiveErrors: this.consecutiveErrors,
    };
  }
}

module.exports = SpotifyMonitor;
