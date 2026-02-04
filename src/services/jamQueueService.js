const { prisma } = require("./spotifyService");
const logger = require("../lib/logger");
const { queueTrack } = require("./player");

/**
 * Jam Queue Service
 * Manages collaborative queue for jam sessions
 */

/**
 * Add track to jam queue with voting
 * @param {string} jamId - Jam session ID
 * @param {string} userId - User adding the track
 * @param {Object} trackData - Track information
 * @returns {Object} Created queue entry
 */
async function addToQueue(jamId, userId, trackData) {
  try {
    // Check if jam exists and is collaborative
    const jam = await prisma.jamSession.findUnique({
      where: { id: jamId },
      include: {
        listeners: {
          where: { isActive: true },
        },
      },
    });

    if (!jam || !jam.isActive) {
      return {
        success: false,
        error: "JAM_INACTIVE",
        message: "Esta jam não está ativa",
      };
    }

    if (jam.jamType !== "collaborative") {
      return {
        success: false,
        error: "NOT_COLLABORATIVE",
        message: "Esta jam não está no modo colaborativo",
      };
    }

    // Check user's pending additions
    const userPendingCount = await prisma.jamQueue.count({
      where: {
        jamId,
        addedBy: userId,
        approved: false,
      },
    });

    if (userPendingCount >= 3) {
      return {
        success: false,
        error: "TOO_MANY_PENDING",
        message:
          "Você já tem 3 músicas aguardando votação. Aguarde a aprovação.",
      };
    }

    // Check user's total in queue
    const userInQueueCount = await prisma.jamQueue.count({
      where: {
        jamId,
        addedBy: userId,
        approved: true,
        playedAt: null,
      },
    });

    if (userInQueueCount >= 5) {
      return {
        success: false,
        error: "QUEUE_LIMIT",
        message: "Você já tem 5 músicas na fila. Aguarde alguma tocar.",
      };
    }

    // Get next position
    const maxPosition = await prisma.jamQueue.findFirst({
      where: { jamId, playedAt: null },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const position = (maxPosition?.position || 0) + 1;

    // Create queue entry
    const queueEntry = await prisma.jamQueue.create({
      data: {
        jamId,
        trackUri: trackData.trackUri,
        trackId: trackData.trackId,
        trackName: trackData.trackName,
        trackArtists: trackData.trackArtists,
        trackAlbum: trackData.trackAlbum,
        trackImage: trackData.trackImage,
        addedBy: userId,
        position,
        approved: false, // Needs voting
      },
      include: {
        addedByUser: {
          select: {
            id: true,
            sender_number: true,
            push_name: true,
            display_name: true,
          },
        },
      },
    });

    logger.info(
      `[JamQueueService] Track added to queue: ${queueEntry.id} for jam ${jamId}`,
    );

    return {
      success: true,
      queueEntry,
      needsVoting: true,
    };
  } catch (err) {
    logger.error("[JamQueueService] Error adding to queue:", err);
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Vote on a queue entry
 * @param {string} queueEntryId - Queue entry ID
 * @param {string} userId - User voting
 * @param {boolean} isFor - Vote for (true) or against (false)
 * @returns {Object} Updated queue entry
 */
async function voteOnQueueEntry(queueEntryId, userId, isFor) {
  try {
    const queueEntry = await prisma.jamQueue.findUnique({
      where: { id: queueEntryId },
      include: {
        jam: {
          include: {
            host: true,
            listeners: {
              where: { isActive: true },
            },
          },
        },
      },
    });

    if (!queueEntry) {
      return {
        success: false,
        error: "NOT_FOUND",
        message: "Entrada na fila não encontrada",
      };
    }

    if (queueEntry.approved) {
      return {
        success: false,
        error: "ALREADY_APPROVED",
        message: "Esta música já foi aprovada",
      };
    }

    // Update votes
    const updatedEntry = await prisma.jamQueue.update({
      where: { id: queueEntryId },
      data: {
        votesFor: isFor ? { increment: 1 } : queueEntry.votesFor,
        votesAgainst: !isFor ? { increment: 1 } : queueEntry.votesAgainst,
      },
    });

    // Check if should be approved/rejected
    const totalEligible = queueEntry.jam.listeners.length + 1; // +1 for host
    const threshold = 0.5;
    const needed = Math.ceil(totalEligible * threshold);

    let status = "pending";
    let approved = false;

    if (updatedEntry.votesFor >= needed) {
      status = "approved";
      approved = true;
      await prisma.jamQueue.update({
        where: { id: queueEntryId },
        data: { approved: true },
      });

      // Add to Spotify queue of host
      try {
        const hostAccount = await prisma.spotifyAccount.findFirst({
          where: { userId: queueEntry.jam.hostUserId },
        });

        if (hostAccount && hostAccount.id) {
          await queueTrack(hostAccount.id, updatedEntry.trackUri);
          logger.info(
            `[JamQueueService] Added track to host Spotify queue: ${updatedEntry.trackName}`,
          );
        } else {
          logger.warn(
            `[JamQueueService] No Spotify account found for host ${queueEntry.jam.hostUserId}`,
          );
        }
      } catch (err) {
        logger.error(
          `[JamQueueService] Error adding track to Spotify queue:`,
          err,
        );
        // Don't fail the approval if queue add fails
      }
    } else if (updatedEntry.votesAgainst > totalEligible - needed) {
      status = "rejected";
      // Delete rejected entry
      await prisma.jamQueue.delete({
        where: { id: queueEntryId },
      });
    }

    logger.info(
      `[JamQueueService] Vote cast on ${queueEntryId}: ${status} (${updatedEntry.votesFor}/${totalEligible})`,
    );

    return {
      success: true,
      queueEntry: status === "rejected" ? null : updatedEntry,
      status,
      approved,
      stats: {
        votesFor: updatedEntry.votesFor,
        votesAgainst: updatedEntry.votesAgainst,
        totalEligible,
        needed,
      },
    };
  } catch (err) {
    logger.error("[JamQueueService] Error voting on queue entry:", err);
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Get jam queue
 * @param {string} jamId - Jam session ID
 * @returns {Object} Queue entries
 */
async function getQueue(jamId) {
  try {
    const entries = await prisma.jamQueue.findMany({
      where: {
        jamId,
        playedAt: null,
        approved: true,
      },
      orderBy: { position: "asc" },
      include: {
        addedByUser: {
          select: {
            id: true,
            sender_number: true,
            push_name: true,
            display_name: true,
          },
        },
      },
    });

    return {
      success: true,
      queue: entries,
    };
  } catch (err) {
    logger.error("[JamQueueService] Error getting queue:", err);
    return {
      success: false,
      error: err.message,
      queue: [],
    };
  }
}

/**
 * Get next track from queue
 * @param {string} jamId - Jam session ID
 * @returns {Object} Next track or null
 */
async function getNextTrack(jamId) {
  try {
    const nextEntry = await prisma.jamQueue.findFirst({
      where: {
        jamId,
        playedAt: null,
        approved: true,
      },
      orderBy: { position: "asc" },
      include: {
        addedByUser: {
          select: {
            id: true,
            push_name: true,
            display_name: true,
          },
        },
      },
    });

    if (!nextEntry) {
      return {
        success: true,
        track: null,
      };
    }

    return {
      success: true,
      track: nextEntry,
    };
  } catch (err) {
    logger.error("[JamQueueService] Error getting next track:", err);
    return {
      success: false,
      error: err.message,
      track: null,
    };
  }
}

/**
 * Mark track as played
 * @param {string} queueEntryId - Queue entry ID
 * @returns {Object} Result
 */
async function markAsPlayed(queueEntryId) {
  try {
    await prisma.jamQueue.update({
      where: { id: queueEntryId },
      data: { playedAt: new Date() },
    });

    logger.info(`[JamQueueService] Track marked as played: ${queueEntryId}`);

    return { success: true };
  } catch (err) {
    logger.error("[JamQueueService] Error marking as played:", err);
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Clear queue (host only)
 * @param {string} jamId - Jam session ID
 * @param {string} userId - User clearing (must be host)
 * @returns {Object} Result
 */
async function clearQueue(jamId, userId) {
  try {
    const jam = await prisma.jamSession.findUnique({
      where: { id: jamId },
    });

    if (!jam) {
      return {
        success: false,
        error: "JAM_NOT_FOUND",
        message: "Jam não encontrada",
      };
    }

    if (jam.hostUserId !== userId) {
      return {
        success: false,
        error: "NOT_HOST",
        message: "Apenas o host pode limpar a fila",
      };
    }

    const deleted = await prisma.jamQueue.deleteMany({
      where: {
        jamId,
        playedAt: null,
      },
    });

    logger.info(
      `[JamQueueService] Queue cleared for jam ${jamId}: ${deleted.count} entries`,
    );

    return {
      success: true,
      deletedCount: deleted.count,
    };
  } catch (err) {
    logger.error("[JamQueueService] Error clearing queue:", err);
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Transfer queue to new host's Spotify
 * @param {string} jamId - Jam session ID
 * @param {string} newHostUserId - New host user ID
 * @returns {Object} Result
 */
async function transferQueueToNewHost(jamId, newHostUserId) {
  try {
    // Get all approved tracks in queue
    const queueTracks = await prisma.jamQueue.findMany({
      where: {
        jamId,
        playedAt: null,
        approved: true,
      },
      orderBy: { position: "asc" },
    });

    if (queueTracks.length === 0) {
      logger.info(`[JamQueueService] No tracks to transfer for jam ${jamId}`);
      return { success: true, transferredCount: 0 };
    }

    // Get new host's Spotify account
    const hostAccount = await prisma.spotifyAccount.findFirst({
      where: { userId: newHostUserId },
    });

    if (!hostAccount || !hostAccount.id) {
      logger.warn(
        `[JamQueueService] No Spotify account found for new host ${newHostUserId}`,
      );
      return {
        success: false,
        error: "NO_SPOTIFY_ACCOUNT",
        message: "Novo host não tem conta Spotify conectada",
      };
    }

    // Add all tracks to new host's Spotify queue
    let transferredCount = 0;
    for (const track of queueTracks) {
      try {
        await queueTrack(hostAccount.id, track.trackUri);
        transferredCount++;
        logger.info(
          `[JamQueueService] Transferred track to new host: ${track.trackName}`,
        );
      } catch (err) {
        logger.error(
          `[JamQueueService] Error transferring track ${track.trackName}:`,
          err,
        );
      }
    }

    logger.info(
      `[JamQueueService] Transferred ${transferredCount}/${queueTracks.length} tracks to new host`,
    );

    return {
      success: true,
      transferredCount,
      totalTracks: queueTracks.length,
    };
  } catch (err) {
    logger.error("[JamQueueService] Error transferring queue:", err);
    return {
      success: false,
      error: err.message,
    };
  }
}

module.exports = {
  addToQueue,
  voteOnQueueEntry,
  getQueue,
  getNextTrack,
  markAsPlayed,
  clearQueue,
  transferQueueToNewHost,
};
