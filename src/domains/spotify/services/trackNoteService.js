const { getPrisma } = require("../../../db");

function normalizeRating(input) {
  if (input === undefined || input === null) return null;
  const s = String(input).trim().replace(",", ".");
  if (s === "") return null;
  const v = Number.parseFloat(s);
  if (Number.isNaN(v)) return null;
  // clamp
  const clamped = Math.max(0, Math.min(10, v));
  // store with 2 decimals
  return Number(Math.round(clamped * 100) / 100).toFixed(2);
}

async function createNote({
  trackId,
  userId,
  ratingRaw,
  note,
  source,
  contextId,
}) {
  if (!trackId) throw new Error("missing_trackId");
  if (!userId) throw new Error("missing_userId");

  const prisma = getPrisma();
  const ratingDecimal = normalizeRating(ratingRaw); // string like '8.50' or null

  // Transaction: insert history, read existing latest, upsert latest, update TrackStat
  const result = await prisma.$transaction(async (tx) => {
    // insert history
    const history = await tx.trackNote.create({
      data: {
        trackId,
        userId,
        note: note || null,
        // keep legacy int null for now; write decimal
        rating: ratingDecimal ? Math.round(parseFloat(ratingDecimal)) : null,
        rating_decimal: ratingDecimal,
      },
    });

    // read previous latest (if any)
    let prevLatest = null;
    try {
      prevLatest = await tx.trackNoteLatest.findUnique({
        where: { trackId_userId: { trackId, userId } },
      });
    } catch (e) {
      // ignore
    }

    // upsert latest
    await tx.trackNoteLatest.upsert({
      where: { trackId_userId: { trackId, userId } },
      create: {
        trackId,
        userId,
        rating: ratingDecimal,
        note: note || null,
      },
      update: {
        rating: ratingDecimal,
        note: note || null,
      },
    });

    // update TrackStat aggregates
    let stat = await tx.trackStat.findUnique({ where: { trackId } });
    const newRating = ratingDecimal ? parseFloat(ratingDecimal) : null;

    if (!stat) {
      // create stat row if missing
      stat = await tx.trackStat.create({
        data: {
          trackId,
          playCount: 0,
          totalListenMs: 0,
          avgSessionMs: null,
          lastPlayedAt: null,
          avgRating: newRating !== null ? newRating.toFixed(2) : null,
          ratingCount: newRating !== null ? 1 : 0,
        },
      });
    } else if (newRating !== null) {
      const prevRating =
        prevLatest && prevLatest.rating
          ? parseFloat(prevLatest.rating)
          : prevLatest &&
            prevLatest.rating !== null &&
            prevLatest.rating !== undefined &&
            prevLatest.rating !== ""
          ? parseFloat(prevLatest.rating)
          : prevLatest && prevLatest.rating !== null
          ? Number(prevLatest.rating)
          : null;
      // Note: prevLatest.rating may be decimal or null; prefer prevLatest.rating field
      // If prevLatest exists and had a rating, adjust aggregate; otherwise increment count
      const currentCount = stat.ratingCount || 0;
      const currentAvg =
        stat.avgRating !== null && stat.avgRating !== undefined
          ? parseFloat(stat.avgRating)
          : 0;

      let newCount = currentCount;
      let newAvg = currentAvg;

      if (
        prevLatest &&
        prevLatest.rating !== null &&
        prevLatest.rating !== undefined
      ) {
        // previous exists: replace value
        const prevVal =
          prevLatest.rating !== null
            ? parseFloat(prevLatest.rating)
            : prevLatest.rating_decimal
            ? parseFloat(prevLatest.rating_decimal)
            : null;
        if (prevVal !== null && !Number.isNaN(prevVal)) {
          // numerator = avg * count
          const numerator = currentAvg * currentCount;
          const adjusted = numerator - prevVal + newRating;
          newAvg = currentCount > 0 ? adjusted / currentCount : newRating;
        } else {
          // unexpected, fallback to recompute later
          newCount = currentCount + 1;
          newAvg = (currentAvg * currentCount + newRating) / newCount;
        }
      } else {
        // new insertion
        newCount = currentCount + 1;
        newAvg = (currentAvg * currentCount + newRating) / newCount;
      }

      await tx.trackStat.update({
        where: { trackId },
        data: {
          avgRating: newAvg.toFixed(2),
          ratingCount: newCount,
        },
      });
    }

    return { history };
  });

  return result.history;
}

module.exports = {
  createNote,
  normalizeRating,
};
