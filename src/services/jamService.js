const { prisma } = require("./spotifyService");
const playbackControl = require("./playbackControlService");
const userSpotifyAdapter = require("./userSpotifyAdapter");
const logger = require("../lib/logger");

/**
 * Jam Service
 * Manages jam/radio sessions where hosts broadcast their playback to listeners
 */

/**
 * Create a new jam session
 * @param {string} hostUserId - User ID of the jam host
 * @param {string} chatId - Optional chat ID where jam is active
 * @returns {Object} Created jam session
 */
async function createJam(hostUserId, chatId = null) {
  try {
    // Check if user already has an active jam
    const existingJam = await prisma.jamSession.findFirst({
      where: {
        hostUserId,
        isActive: true,
      },
    });

    if (existingJam) {
      return {
        success: false,
        error: "USER_ALREADY_HOSTING",
        message: "Você já está hospedando uma jam ativa",
        jam: existingJam,
      };
    }

    // Get host's current playback state
    const currentPlayback =
      await userSpotifyAdapter.getCurrentlyPlaying(hostUserId);

    // Create jam session
    const jam = await prisma.jamSession.create({
      data: {
        hostUserId,
        chatId,
        isActive: true,
        currentTrackId: currentPlayback?.id || null,
        currentTrackUri: currentPlayback?.url || null,
        currentTrackName: currentPlayback?.name || null,
        currentArtists: currentPlayback?.artists
          ? currentPlayback.artists.join(", ")
          : null,
        currentProgressMs: currentPlayback?.progress_ms || 0,
        isPlaying: currentPlayback?.playing || false,
        lastSyncAt: new Date(),
      },
      include: {
        host: {
          select: {
            id: true,
            push_name: true,
            display_name: true,
          },
        },
      },
    });

    logger.info(`[JamService] Created jam ${jam.id} hosted by ${hostUserId}`);

    return {
      success: true,
      jam,
    };
  } catch (err) {
    logger.error("[JamService] Error creating jam:", err);
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Get all active jam sessions
 * @param {string} chatId - Optional: filter by chat ID
 * @returns {Array} Active jam sessions
 */
async function getActiveJams(chatId = null) {
  try {
    const where = {
      isActive: true,
    };

    if (chatId) {
      where.chatId = chatId;
    }

    const jams = await prisma.jamSession.findMany({
      where,
      include: {
        host: {
          select: {
            id: true,
            push_name: true,
            display_name: true,
          },
        },
        listeners: {
          where: {
            isActive: true,
          },
          include: {
            user: {
              select: {
                id: true,
                push_name: true,
                display_name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return {
      success: true,
      jams,
    };
  } catch (err) {
    logger.error("[JamService] Error getting active jams:", err);
    return {
      success: false,
      error: err.message,
      jams: [],
    };
  }
}

/**
 * Get jam session by ID
 */
async function getJamById(jamId) {
  try {
    const jam = await prisma.jamSession.findUnique({
      where: { id: jamId },
      include: {
        host: {
          select: {
            id: true,
            push_name: true,
            display_name: true,
          },
        },
        listeners: {
          where: {
            isActive: true,
          },
          include: {
            user: {
              select: {
                id: true,
                push_name: true,
                display_name: true,
              },
            },
          },
        },
      },
    });

    if (!jam) {
      return {
        success: false,
        error: "JAM_NOT_FOUND",
        message: "Jam não encontrada",
      };
    }

    return {
      success: true,
      jam,
    };
  } catch (err) {
    logger.error("[JamService] Error getting jam:", err);
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Join a jam session
 * @param {string} jamId - Jam session ID
 * @param {string} userId - User ID joining the jam
 * @returns {Object} Result with listener record
 */
async function joinJam(jamId, userId) {
  try {
    // Check if jam exists and is active
    const jamResult = await getJamById(jamId);
    if (!jamResult.success) {
      return jamResult;
    }

    const jam = jamResult.jam;

    if (!jam.isActive) {
      return {
        success: false,
        error: "JAM_INACTIVE",
        message: "Esta jam não está mais ativa",
      };
    }

    // Check if user is the host
    if (jam.hostUserId === userId) {
      return {
        success: false,
        error: "USER_IS_HOST",
        message: "Você é o host desta jam",
      };
    }

    // Check if already listening
    const existingListener = await prisma.jamListener.findUnique({
      where: {
        jamId_userId: {
          jamId,
          userId,
        },
      },
    });

    if (existingListener && existingListener.isActive) {
      return {
        success: false,
        error: "ALREADY_LISTENING",
        message: "Você já está ouvindo esta jam",
        listener: existingListener,
      };
    }

    // Create or reactivate listener
    const listener = await prisma.jamListener.upsert({
      where: {
        jamId_userId: {
          jamId,
          userId,
        },
      },
      update: {
        isActive: true,
        joinedAt: new Date(),
      },
      create: {
        jamId,
        userId,
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            push_name: true,
            display_name: true,
          },
        },
      },
    });

    // Sync listener's playback with jam
    const syncResult = await syncListener(jamId, userId);

    logger.info(`[JamService] User ${userId} joined jam ${jamId}`);

    return {
      success: true,
      listener,
      synced: syncResult.success,
      jam,
    };
  } catch (err) {
    logger.error("[JamService] Error joining jam:", err);
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Leave a jam session
 * @param {string} jamId - Jam session ID
 * @param {string} userId - User ID leaving the jam
 */
async function leaveJam(jamId, userId) {
  try {
    const listener = await prisma.jamListener.findUnique({
      where: {
        jamId_userId: {
          jamId,
          userId,
        },
      },
    });

    if (!listener) {
      return {
        success: false,
        error: "NOT_LISTENING",
        message: "Você não está ouvindo esta jam",
      };
    }

    // Mark as inactive instead of deleting (keeps history)
    await prisma.jamListener.update({
      where: {
        jamId_userId: {
          jamId,
          userId,
        },
      },
      data: {
        isActive: false,
      },
    });

    logger.info(`[JamService] User ${userId} left jam ${jamId}`);

    return {
      success: true,
    };
  } catch (err) {
    logger.error("[JamService] Error leaving jam:", err);
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * End a jam session (only host can do this)
 * @param {string} jamId - Jam session ID
 * @param {string} userId - User ID (must be host)
 */
async function endJam(jamId, userId) {
  try {
    const jamResult = await getJamById(jamId);
    if (!jamResult.success) {
      return jamResult;
    }

    const jam = jamResult.jam;

    // Verify user is the host
    if (jam.hostUserId !== userId) {
      return {
        success: false,
        error: "NOT_HOST",
        message: "Apenas o host pode encerrar a jam",
      };
    }

    // Deactivate jam and all listeners
    await prisma.jamSession.update({
      where: { id: jamId },
      data: {
        isActive: false,
      },
    });

    await prisma.jamListener.updateMany({
      where: { jamId },
      data: {
        isActive: false,
      },
    });

    logger.info(`[JamService] Jam ${jamId} ended by host ${userId}`);

    return {
      success: true,
    };
  } catch (err) {
    logger.error("[JamService] Error ending jam:", err);
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Synchronize a listener's playback with the jam's current state
 * @param {string} jamId - Jam session ID
 * @param {string} userId - Listener user ID
 */
async function syncListener(jamId, userId) {
  try {
    const jamResult = await getJamById(jamId);
    if (!jamResult.success) {
      return jamResult;
    }

    const jam = jamResult.jam;

    if (!jam.currentTrackUri) {
      return {
        success: false,
        error: "NO_TRACK",
        message: "A jam não está tocando nenhuma música no momento",
      };
    }

    // Sync listener's playback
    const syncResult = await playbackControl.syncPlayback(userId, {
      trackUri: jam.currentTrackUri,
      positionMs: jam.currentProgressMs || 0,
      isPlaying: jam.isPlaying,
    });

    if (!syncResult.success) {
      logger.warn(
        `[JamService] Failed to sync listener ${userId}: ${syncResult.error}`,
      );
      return syncResult;
    }

    // Update last sync time
    await prisma.jamListener.update({
      where: {
        jamId_userId: {
          jamId,
          userId,
        },
      },
      data: {
        lastSyncAt: new Date(),
      },
    });

    logger.info(`[JamService] Synced listener ${userId} to jam ${jamId}`);

    return {
      success: true,
    };
  } catch (err) {
    logger.error("[JamService] Error syncing listener:", err);
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Update jam's playback state (called by monitor when host's track changes)
 * @param {string} jamId - Jam session ID
 * @param {Object} playbackData - New playback state
 */
async function updateJamPlayback(jamId, playbackData) {
  try {
    const jam = await prisma.jamSession.update({
      where: { id: jamId },
      data: {
        currentTrackId: playbackData.id || null,
        currentTrackUri: playbackData.url || null,
        currentTrackName: playbackData.name || null,
        currentArtists: playbackData.artists
          ? playbackData.artists.join(", ")
          : null,
        currentProgressMs: playbackData.progress_ms || 0,
        isPlaying: playbackData.playing || false,
        lastSyncAt: new Date(),
      },
    });

    logger.info(`[JamService] Updated jam ${jamId} playback state`);

    return {
      success: true,
      jam,
    };
  } catch (err) {
    logger.error("[JamService] Error updating jam playback:", err);
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Sync all listeners in a jam to the current state
 * @param {string} jamId - Jam session ID
 */
async function syncAllListeners(jamId) {
  try {
    const jamResult = await getJamById(jamId);
    if (!jamResult.success) {
      return jamResult;
    }

    const jam = jamResult.jam;
    const results = [];

    // Sync each active listener
    for (const listener of jam.listeners) {
      if (listener.isActive) {
        const syncResult = await syncListener(jamId, listener.userId);
        results.push({
          userId: listener.userId,
          success: syncResult.success,
          error: syncResult.error,
        });

        // Small delay between syncs to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    logger.info(
      `[JamService] Synced ${results.length} listeners for jam ${jamId}`,
    );

    return {
      success: true,
      results,
    };
  } catch (err) {
    logger.error("[JamService] Error syncing all listeners:", err);
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Check if user is currently in any jam (as host or listener)
 * @param {string} userId - User ID
 */
async function getUserActiveJam(userId) {
  try {
    // Check if hosting
    const hostedJam = await prisma.jamSession.findFirst({
      where: {
        hostUserId: userId,
        isActive: true,
      },
      include: {
        listeners: {
          where: { isActive: true },
          include: {
            user: {
              select: {
                id: true,
                push_name: true,
                display_name: true,
              },
            },
          },
        },
      },
    });

    if (hostedJam) {
      return {
        success: true,
        role: "host",
        jam: hostedJam,
      };
    }

    // Check if listening
    const listeningTo = await prisma.jamListener.findFirst({
      where: {
        userId,
        isActive: true,
      },
      include: {
        jam: {
          include: {
            host: {
              select: {
                id: true,
                push_name: true,
                display_name: true,
              },
            },
            listeners: {
              where: { isActive: true },
              include: {
                user: {
                  select: {
                    id: true,
                    push_name: true,
                    display_name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (listeningTo) {
      return {
        success: true,
        role: "listener",
        jam: listeningTo.jam,
      };
    }

    return {
      success: true,
      role: null,
      jam: null,
    };
  } catch (err) {
    logger.error("[JamService] Error getting user active jam:", err);
    return {
      success: false,
      error: err.message,
    };
  }
}

module.exports = {
  createJam,
  getActiveJams,
  getJamById,
  joinJam,
  leaveJam,
  endJam,
  syncListener,
  updateJamPlayback,
  syncAllListeners,
  getUserActiveJam,
};
