const trackNoteService = require("../services/trackNoteService");

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
  listNotes,
  getLatestNotes,
  getTrackStats,
};
