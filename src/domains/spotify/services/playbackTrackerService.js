const trackRepo = require("../repo/trackRepo");
const playbackRepo = require("../repo/playbackRepo");
const sessionRepo = require("../repo/sessionRepo");
const summaryRepo = require("../repo/summaryRepo");
const path = require("path");
const { spotifyFetch } = require(
  path.join(__dirname, "..", "..", "..", "services", "spotifyService"),
);

/**
 * PlaybackTracker Service
 * Orchestrates recording playbacks from the monitor with:
 * - In-memory session caching for throttling
 * - Track metadata enrichment
 * - Session management
 * - Stats aggregation
 */

//
// ── Playback tracking tunables ────────────────────────────────────────────────
/** Queda de progress_ms maior que isso → detecta loop/restart na mesma faixa */
const RESTART_BACKWARD_THRESHOLD_MS = 5_000;
/** Cap de wall-clock por ciclo — evita somar gaps enormes em caso de crash/reinício */
const WALL_CLOCK_MAX_GAP_MS = 60_000;
/** Tempo máximo de início recuperável via progress_ms (evita contar seeks pro meio) */
const SEED_CAP_MS = 30_000;
/** Delta máximo plausível de progress_ms por ciclo (cobre intervalo fast + margem) */
const PROGRESS_DELTA_MAX_MS = 65_000;
/** Acumular este tempo de escuta antes de fazer flush ao banco */
const FLUSH_INTERVAL_MS = 30_000;
/** Ou fazer flush ao atingir esta fração da duração total da faixa */
const FLUSH_TRACK_FRACTION = 0.3;
/** Plays abaixo deste percentual são marcados como skipped */
const SKIP_THRESHOLD_PERCENT = 30;
/** Intervalo do checkpoint periódico de segurança (flush de todas as sessões ativas) */
const CHECKPOINT_INTERVAL_MS = 90_000;
// ─────────────────────────────────────────────────────────────────────────────

// In-memory cache for active listening sessions
const activeSessions = new Map(); // userId -> { trackId, playbackId, lastSave, lastProgressMs, accumulatedMs, totalMs, durationMs }

// Cache for enriched track data (TTL: 1 hour)
const trackCache = new Map(); // trackId -> { data, timestamp }
const TRACK_CACHE_TTL = 60 * 60 * 1000; // 1 hour

module.exports = {
  /**
   * Record a playback event from monitor
   * Handles throttling, deduplication, and enrichment
   */
  async recordPlayback({ userId, accountId, trackData, deviceId, progressMs }) {
    const now = Date.now();
    const session = activeSessions.get(userId);
    const currentProgressMs = progressMs || 0;

    // Detect loop/restart: same trackId but progress jumped backwards > RESTART_BACKWARD_THRESHOLD_MS
    const isRestart =
      session &&
      session.trackId === trackData.id &&
      currentProgressMs <
        (session.lastProgressMs || 0) - RESTART_BACKWARD_THRESHOLD_MS;

    // Check if track changed or restarted (loop)
    const isNewTrack =
      !session || session.trackId !== trackData.id || isRestart;

    if (isNewTrack) {
      // Flush previous session — first add residual time (tail of last track)
      if (session) {
        if (session.durationMs && session.lastProgressMs != null) {
          const remainingMs = session.durationMs - session.lastProgressMs;
          const wallElapsed = Math.min(
            now - session.lastSave,
            WALL_CLOCK_MAX_GAP_MS,
          );
          const residual = Math.max(0, Math.min(remainingMs, wallElapsed));
          if (residual > 0) {
            session.accumulatedMs += residual;
            session.totalMs = (session.totalMs || 0) + residual;
          }
        }
        await this.flushSession(userId, session);
      }

      // Enrich and upsert track metadata
      await this.ensureTrackMetadata(trackData);

      // Check if first play for user
      const isFirstPlay = await playbackRepo.isFirstPlayForUser(
        userId,
        trackData.id,
      );

      // Get or create listening session
      let listeningSession = await sessionRepo.getActiveSession(userId);
      if (!listeningSession) {
        listeningSession = await sessionRepo.create(
          userId,
          this.inferDeviceType(trackData.device_type),
          trackData.context?.type,
        );
      }

      // Recover undetected listening time at track start.
      // If progress_ms < 30s the user started this track before the last poll
      // (e.g. wasn't playing → started → detected 20s later).
      // progress_ms is the exact elapsed play time reported by Spotify, so we
      // can safely pre-seed it. We cap at SEED_CAP_MS to avoid counting mid-track seeks.
      const seedMs =
        currentProgressMs > 0 && currentProgressMs < SEED_CAP_MS
          ? currentProgressMs
          : 0;

      // Back-date startedAt to reflect when playback actually began
      const startedAt = seedMs > 0 ? new Date(now - seedMs) : new Date();

      // Create new playback record
      const playback = await playbackRepo.create({
        accountId,
        userId,
        trackId: trackData.id,
        deviceId,
        deviceType: this.inferDeviceType(trackData.device_type),
        contextType: trackData.context?.type,
        contextId: trackData.context?.uri,
        startedAt,
        listenedMs: seedMs,
        percentPlayed: 0,
        isFirstPlay,
        sessionId: listeningSession.id,
        source: "monitor",
      });

      // Store in active sessions cache
      activeSessions.set(userId, {
        trackId: trackData.id,
        playbackId: playback.id,
        sessionId: listeningSession.id,
        lastSave: now,
        lastProgressMs: currentProgressMs,
        // accumulatedMs: time since last flush; totalMs: cumulative listened for this playback
        accumulatedMs: seedMs,
        totalMs: seedMs,
        durationMs: trackData.duration_ms || null,
      });

      return;
    }

    // Same track continuing — use progress_ms delta as source of truth.
    // This correctly handles pauses (delta ≈ 0), seeks, and avoids wall-clock drift.
    const progressDelta = currentProgressMs - (session.lastProgressMs || 0);
    // Valid delta: positive and within a plausible range (≤ PROGRESS_DELTA_MAX_MS)
    const elapsed =
      progressDelta > 0 && progressDelta < PROGRESS_DELTA_MAX_MS
        ? progressDelta
        : 0;

    session.accumulatedMs += elapsed;
    session.totalMs = (session.totalMs || 0) + elapsed;
    session.lastProgressMs = currentProgressMs;
    session.lastSave = now;

    // Determine if should flush to DB
    const shouldFlush =
      session.accumulatedMs >= FLUSH_INTERVAL_MS || // every FLUSH_INTERVAL_MS of actual listening
      (session.durationMs &&
        session.accumulatedMs >= session.durationMs * FLUSH_TRACK_FRACTION) || // or FLUSH_TRACK_FRACTION of track
      !trackData.is_playing; // or stopped playing

    if (shouldFlush) {
      await this.flushSession(userId, session);
    }
  },

  /**
   * Flush accumulated time to database
   */
  async flushSession(userId, session) {
    if (session.accumulatedMs === 0) return;

    // Use cumulative totalMs to compute percent played relative to track duration
    const totalMs = session.totalMs || session.accumulatedMs;
    const percentPlayed = session.durationMs
      ? (totalMs / session.durationMs) * 100
      : 0;
    const wasSkipped = percentPlayed < SKIP_THRESHOLD_PERCENT; // consider skipped if < SKIP_THRESHOLD_PERCENT%

    try {
      // Update playback record with cumulative listened time
      // Load current playback row to check metadata/counting state
      const currentPlayback = await playbackRepo.findById(session.playbackId);

      // Decide whether to increment track stats.
      let shouldIncrement = false;
      if (!wasSkipped) {
        const alreadyCounted =
          currentPlayback &&
          currentPlayback.metadata &&
          currentPlayback.metadata.counted === true;

        if (!alreadyCounted) {
          // Check for a previous non-skipped playback by this user for the same track
          const prev = await playbackRepo.findPreviousNonSkipped(
            userId,
            session.trackId,
            session.playbackId,
          );

          if (!prev) {
            // No previous non-skipped playback -> count this one
            shouldIncrement = true;
          } else {
            // Only allow counting again if previous >=40% and current >=30%
            const prevPct = Number(prev.percentPlayed || 0);
            const curPct = Number(percentPlayed || 0);
            if (prevPct >= 40 && curPct >= 30) shouldIncrement = true;
          }
        }
      }

      // Update playback record (and mark counted if we incremented)
      const newMetadata = Object.assign(
        {},
        currentPlayback && currentPlayback.metadata
          ? currentPlayback.metadata
          : {},
      );
      if (shouldIncrement) newMetadata.counted = true;

      await playbackRepo.update(session.playbackId, {
        listenedMs: totalMs,
        percentPlayed,
        wasSkipped,
        endedAt: new Date(),
        metadata: newMetadata,
      });

      // Count towards global track stats only once per non-skipped play (deduplication)
      if (shouldIncrement) {
        await trackRepo.incrementStats(session.trackId, totalMs);
      }

      // Always accumulate listening time into user summary and session stats
      // using the delta since last flush — independent of skip/dedup logic
      if (session.accumulatedMs > 0) {
        await summaryRepo.addListeningTime(
          userId,
          session.accumulatedMs,
          session.trackId,
        );

        await sessionRepo.incrementStats(
          session.sessionId,
          session.accumulatedMs,
        );
      }

      // Reset accumulator (keep totalMs for cumulative percent across multiple flushes)
      session.accumulatedMs = 0;
    } catch (error) {
      console.log("[PlaybackTracker] Error flushing session:", error);
    }
  },

  /**
   * Ensure track has metadata (fetch if needed)
   */
  async ensureTrackMetadata(trackData) {
    const cached = trackCache.get(trackData.id);
    if (cached && Date.now() - cached.timestamp < TRACK_CACHE_TTL) {
      return cached.data;
    }

    // Upsert basic track info
    const track = await trackRepo.upsertTrack({
      id: trackData.id,
      name: trackData.name,
      artists: trackData.artists,
      album: trackData.album,
      durationMs: trackData.duration_ms,
      imageUrl: trackData.image,
      popularity: trackData.popularity,
      metadata: {
        explicit: trackData.explicit,
        previewUrl: trackData.preview_url,
      },
    });

    // Cache result
    trackCache.set(trackData.id, {
      data: track,
      timestamp: Date.now(),
    });

    // Enrich with audio features in background (don't await)
    // Suppress enrichment errors to avoid noisy logs when track metadata
    // is in an unexpected format (some sources store artists as plain strings).
    this.enrichTrackInBackground(trackData.id).catch(() => {});

    return track;
  },

  /**
   * Enrich track with audio features and genres (background)
   */
  async enrichTrackInBackground(trackId) {
    const track = await trackRepo.findById(trackId);
    if (!track || track.audioFeatures) {
      return; // Already enriched
    }

    try {
      // Fetch audio features from Spotify API
      const audioFeatures = await this.fetchAudioFeatures(trackId);

      // Fetch genres from artists. Track repo may store `artists` either as
      // a JSON string (array) or as a simple string like "Eminem".
      let artists = [];
      try {
        if (!track.artists) {
          artists = [];
        } else if (Array.isArray(track.artists)) {
          artists = track.artists;
        } else if (typeof track.artists === "string") {
          const s = track.artists.trim();
          if (s.startsWith("[") || s.startsWith("{")) {
            // Attempt parse when it looks like JSON
            try {
              artists = JSON.parse(s);
            } catch (e) {
              // fallback to single-name artist
              artists = [{ name: s }];
            }
          } else {
            // Plain string — treat as single artist name
            artists = [{ name: s }];
          }
        } else {
          artists = [];
        }
      } catch (e) {
        artists = [];
      }

      const genres = await this.fetchGenres(artists);

      // Update track
      await trackRepo.upsertTrack({
        id: trackId,
        audioFeatures,
        genres,
        forceUpdate: true,
      });
    } catch (error) {
      // Suppress enrichment errors to avoid noisy logs for malformed metadata
      // (enrichment is best-effort).
    }
  },

  /**
   * Fetch audio features from Spotify API
   */
  async fetchAudioFeatures(trackId) {
    // This requires a Spotify account token - use bot account
    // GET https://api.spotify.com/v1/audio-features/{trackId}
    // For now, return null - will be implemented when needed
    return null;
  },

  /**
   * Fetch genres from artists
   */
  async fetchGenres(artists) {
    // GET https://api.spotify.com/v1/artists/{artistId}
    // For now, return empty - will be implemented when needed
    return [];
  },

  /**
   * Infer device type from Spotify device info
   */
  inferDeviceType(spotifyDeviceType) {
    if (!spotifyDeviceType) return "unknown";

    const type = spotifyDeviceType.toLowerCase();
    if (type.includes("computer")) return "computer";
    if (type.includes("smartphone") || type.includes("phone"))
      return "smartphone";
    if (type.includes("speaker")) return "speaker";
    if (type.includes("tv")) return "tv";
    return type;
  },

  /**
   * Force flush all active sessions (on shutdown)
   */
  async flushAll() {
    for (const [userId, session] of activeSessions.entries()) {
      await this.flushSession(userId, session);
    }

    activeSessions.clear();
  },

  /**
   * Get active sessions count (for monitoring)
   */
  getActiveSessionsCount() {
    return activeSessions.size;
  },
};

// Safety net: flush all active sessions periodically to limit data loss on unexpected crash.
// In the worst case, at most ~90s of listening time can be lost.
setInterval(() => {
  module.exports
    .flushAll()
    .catch((e) =>
      console.error("[PlaybackTracker] checkpoint flush error:", e),
    );
}, CHECKPOINT_INTERVAL_MS);
