const trackRepo = require("../repo/trackRepo");
const playbackRepo = require("../repo/playbackRepo");
const sessionRepo = require("../repo/sessionRepo");
const summaryRepo = require("../repo/summaryRepo");
const { spotifyFetch } = require("../../../services/spotifyService");

/**
 * PlaybackTracker Service
 * Orchestrates recording playbacks from the monitor with:
 * - In-memory session caching for throttling
 * - Track metadata enrichment
 * - Session management
 * - Stats aggregation
 */

// In-memory cache for active listening sessions
const activeSessions = new Map(); // userId -> { trackId, playbackId, lastSave, accumulatedMs, durationMs }

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

    console.log(
      `[PlaybackTracker] recordPlayback userId=${userId} track=${trackData.id}`
    );

    // Check if track changed
    const isNewTrack = !session || session.trackId !== trackData.id;

    if (isNewTrack) {
      // Flush previous session if exists
      if (session) {
        await this.flushSession(userId, session);
      }

      // Enrich and upsert track metadata
      await this.ensureTrackMetadata(trackData);

      // Check if first play for user
      const isFirstPlay = await playbackRepo.isFirstPlayForUser(
        userId,
        trackData.id
      );

      // Get or create listening session
      let listeningSession = await sessionRepo.getActiveSession(userId);
      if (!listeningSession) {
        listeningSession = await sessionRepo.create(
          userId,
          this.inferDeviceType(trackData.device_type),
          trackData.context?.type
        );
      }

      // Create new playback record
      const playback = await playbackRepo.create({
        accountId,
        userId,
        trackId: trackData.id,
        deviceId,
        deviceType: this.inferDeviceType(trackData.device_type),
        contextType: trackData.context?.type,
        contextId: trackData.context?.uri,
        startedAt: new Date(),
        listenedMs: 0,
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
        // accumulatedMs: time since last flush; totalMs: cumulative listened for this playback
        accumulatedMs: 0,
        totalMs: 0,
        durationMs: trackData.duration_ms || 180000, // default 3min
      });

      console.log(
        `[PlaybackTracker] New track detected for ${userId}: ${trackData.name}`
      );
      return;
    }

    // Same track continuing - accumulate time
    const elapsed = Math.min(now - session.lastSave, 60000); // max 60s between checks
    session.accumulatedMs += elapsed;
    session.totalMs = (session.totalMs || 0) + elapsed;
    session.lastSave = now;

    // Determine if should flush to DB
    const shouldFlush =
      session.accumulatedMs >= 30000 || // every 30s
      session.accumulatedMs >= session.durationMs * 0.3 || // or 30% of track
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
    const wasSkipped = percentPlayed < 30; // consider skipped if < 30%

    console.log(
      `[PlaybackTracker] Flushing session for ${userId}: ${
        session.accumulatedMs
      }ms (${percentPlayed.toFixed(1)}%)`
    );

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
            session.playbackId
          );

          if (!prev) {
            // No previous non-skipped playback -> count this one
            shouldIncrement = true;
          } else {
            // Only allow counting again if previous >=90% and current >=80%
            const prevPct = Number(prev.percentPlayed || 0);
            const curPct = Number(percentPlayed || 0);
            if (prevPct >= 90 && curPct >= 80) shouldIncrement = true;
          }
        }
      }

      // Update playback record (and mark counted if we incremented)
      const newMetadata = Object.assign(
        {},
        currentPlayback && currentPlayback.metadata
          ? currentPlayback.metadata
          : {}
      );
      if (shouldIncrement) newMetadata.counted = true;

      await playbackRepo.update(session.playbackId, {
        listenedMs: totalMs,
        percentPlayed,
        wasSkipped,
        endedAt: new Date(),
        metadata: newMetadata,
      });

      // Only count towards stats if determined above
      if (shouldIncrement) {
        await trackRepo.incrementStats(session.trackId, session.accumulatedMs);

        // Update user summary
        await summaryRepo.addListeningTime(
          userId,
          session.accumulatedMs,
          session.trackId
        );

        // Update session stats
        await sessionRepo.incrementStats(
          session.sessionId,
          session.accumulatedMs
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
    this.enrichTrackInBackground(trackData.id).catch((err) => {
      console.warn(
        `[PlaybackTracker] Failed to enrich track ${trackData.id}:`,
        err.message
      );
    });

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

      // Fetch genres from artists
      const artists = JSON.parse(track.artists || "[]");
      const genres = await this.fetchGenres(artists);

      // Update track
      await trackRepo.upsertTrack({
        id: trackId,
        audioFeatures,
        genres,
        forceUpdate: true,
      });

      console.log(
        `[PlaybackTracker] Enriched track ${trackId} with audio features and genres`
      );
    } catch (error) {
      console.warn(
        `[PlaybackTracker] Failed to enrich track ${trackId}:`,
        error.message
      );
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
    console.log(
      `[PlaybackTracker] Flushing ${activeSessions.size} active sessions`
    );

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
