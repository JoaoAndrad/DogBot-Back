const trackNoteService = require("../services/trackNoteService");
const userSpotifyAdapter = require("../../../services/userSpotifyAdapter");
const userRepo = require("../../users/repo/userRepo");
const playbackRepo = require("../repo/playbackRepo");
const trackRepo = require("../repo/trackRepo");

/**
 * POST /api/spotify/notes
 * Simplified endpoint: receives userId and rating, resolves current track, saves note
 */
async function createNoteSimple(req, res) {
  try {
    const { userId, rating: ratingRaw, source } = req.body || {};
    if (!userId) return res.status(400).json({ error: "missing_userId" });
    if (!ratingRaw) return res.status(400).json({ error: "missing_rating" });

    // Normalize and validate rating
    const rating = trackNoteService.normalizeRating(ratingRaw);
    if (!rating) {
      return res
        .status(400)
        .json({
          error: "invalid_rating",
          message: "Use número entre 0.0 e 10.0",
        });
    }

    // Resolve userId to internal UUID if needed
    let resolvedUserId = userId;
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        userId
      );
    if (!isUUID) {
      try {
        const u = await userRepo.findByIdentifierExact(userId);
        if (u && u.id) resolvedUserId = u.id;
        else {
          const base = userRepo.extractBaseNumber(userId);
          const u2 = await userRepo.findByBaseNumber(base);
          if (u2 && u2.id) resolvedUserId = u2.id;
        }
      } catch (e) {
        // continue with original userId
      }
    }

    // Try to get currently playing track
    let trackId = null;
    try {
      const live = await userSpotifyAdapter.getCurrentlyPlaying(resolvedUserId);
      if (live && live.playing && !live.error && live.id) {
        trackId = live.id;
      }
    } catch (err) {
      console.warn("createNoteSimple: live lookup failed", err && err.message);
    }

    // Fallback: get most recent playback from DB
    if (!trackId) {
      const recent = await playbackRepo.getRecent(resolvedUserId, 1);
      if (
        recent &&
        recent.length > 0 &&
        recent[0].track &&
        recent[0].track.id
      ) {
        trackId = recent[0].track.id;
      }
    }

    if (!trackId) {
      return res
        .status(404)
        .json({
          error: "no_track_playing",
          message: "Não consegui detectar música atual",
        });
    }

    // Create note
    const history = await trackNoteService.createNote({
      trackId,
      userId: resolvedUserId,
      ratingRaw: rating,
      note: null,
      source: source || "whatsapp",
      contextId: null,
    });

    // Fetch track info and stats for response
    const prisma = require("../../../db").getPrisma();
    const track = await prisma.track.findUnique({ where: { id: trackId } });
    const stat = await prisma.trackStat.findUnique({ where: { trackId } });

    return res.json({
      success: true,
      note: history,
      trackId,
      trackName: track ? track.name : null,
      rating: rating,
      avgRating: stat && stat.avgRating ? stat.avgRating : null,
      ratingCount: stat && stat.ratingCount ? stat.ratingCount : 0,
    });
  } catch (err) {
    console.error(
      "trackNoteController.createNoteSimple error:",
      err && err.message ? err.message : err
    );
    return res
      .status(500)
      .json({ error: "internal_error", details: err.message });
  }
}

async function createNote(req, res) {
  try {
    const trackId = req.params.trackId;
    const { userId, rating, note, source, contextId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "missing_userId" });

    const history = await trackNoteService.createNote({
      trackId,
      userId,
      ratingRaw: rating,
      note,
      source,
      contextId,
    });

    return res.json({ success: true, note: history });
  } catch (err) {
    console.error(
      "trackNoteController.createNote error:",
      err && err.message ? err.message : err
    );
    return res
      .status(500)
      .json({ error: "internal_error", details: err.message });
  }
}

async function listNotes(req, res) {
  try {
    const trackId = req.params.trackId;
    const prisma = require("../../../db").getPrisma();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 50);
    const skip = (page - 1) * limit;

    const where = { trackId };
    if (req.query.userId) where.userId = req.query.userId;

    const [data, total] = await Promise.all([
      prisma.trackNote.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.trackNote.count({ where }),
    ]);

    return res.json({ data, page, limit, total });
  } catch (err) {
    console.error(
      "trackNoteController.listNotes error:",
      err && err.message ? err.message : err
    );
    return res
      .status(500)
      .json({ error: "internal_error", details: err.message });
  }
}

async function getLatestNotes(req, res) {
  try {
    const trackId = req.params.trackId;
    const prisma = require("../../../db").getPrisma();
    const where = { trackId };
    if (req.query.userId) where.userId = req.query.userId;
    const data = await prisma.trackNoteLatest.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    return res.json({ data });
  } catch (err) {
    console.error(
      "trackNoteController.getLatestNotes error:",
      err && err.message ? err.message : err
    );
    return res
      .status(500)
      .json({ error: "internal_error", details: err.message });
  }
}

async function getTrackStats(req, res) {
  try {
    const trackId = req.params.trackId;
    const prisma = require("../../../db").getPrisma();
    const stat = await prisma.trackStat.findUnique({ where: { trackId } });
    if (!stat) return res.json({ trackId, avgRating: null, ratingCount: 0 });
    return res.json({
      trackId,
      avgRating: stat.avgRating,
      ratingCount: stat.ratingCount || 0,
    });
  } catch (err) {
    console.error(
      "trackNoteController.getTrackStats error:",
      err && err.message ? err.message : err
    );
    return res
      .status(500)
      .json({ error: "internal_error", details: err.message });
  }
}

module.exports = {
  createNote,
  createNoteSimple,
  listNotes,
  getLatestNotes,
  getTrackStats,
};
