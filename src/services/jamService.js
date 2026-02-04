const { prisma, spotifyFetch } = require("./spotifyService");
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
        currentTrackAlbum: currentPlayback?.album || null,
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
 * @param {boolean} fetchCurrentPlayback - Whether to fetch current playback from Spotify (default: true)
 * @returns {Array} Active jam sessions
 */
async function getActiveJams(chatId = null, fetchCurrentPlayback = true) {
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
            sender_number: true,
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
                sender_number: true,
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

    // Fetch current playback for each jam if requested
    if (fetchCurrentPlayback) {
      for (const jam of jams) {
        try {
          const currentPlayback = await userSpotifyAdapter.getCurrentlyPlaying(
            jam.hostUserId,
          );

          if (currentPlayback && currentPlayback.id) {
            // Update jam with current playback
            jam.currentTrackId = currentPlayback.id;
            jam.currentTrackUri = currentPlayback.url;
            jam.currentTrackName = currentPlayback.name;
            jam.currentTrackAlbum = currentPlayback.album;
            jam.currentArtists = currentPlayback.artists?.join(", ") || null;
            jam.currentProgressMs = currentPlayback.progressMs;
            jam.isPlaying = currentPlayback.isPlaying || false;

            // Update lastActiveAt in database if host is playing
            if (currentPlayback.isPlaying) {
              await prisma.jamSession.update({
                where: { id: jam.id },
                data: {
                  currentTrackId: currentPlayback.id,
                  currentTrackUri: currentPlayback.url,
                  currentTrackName: currentPlayback.name,
                  currentTrackAlbum: currentPlayback.album,
                  currentArtists: currentPlayback.artists?.join(", ") || null,
                  currentProgressMs: currentPlayback.progressMs,
                  isPlaying: true,
                  lastActiveAt: new Date(),
                },
              });
            } else {
              // Update playback state but not lastActiveAt
              await prisma.jamSession.update({
                where: { id: jam.id },
                data: {
                  currentTrackId: currentPlayback.id,
                  currentTrackUri: currentPlayback.url,
                  currentTrackName: currentPlayback.name,
                  currentTrackAlbum: currentPlayback.album,
                  currentArtists: currentPlayback.artists?.join(", ") || null,
                  currentProgressMs: currentPlayback.progressMs,
                  isPlaying: false,
                },
              });
            }
          } else {
            // No playback - clear current track info and mark as not playing
            jam.currentTrackId = null;
            jam.currentTrackUri = null;
            jam.currentTrackName = null;
            jam.currentTrackAlbum = null;
            jam.currentArtists = null;
            jam.currentProgressMs = null;
            jam.isPlaying = false;

            await prisma.jamSession.update({
              where: { id: jam.id },
              data: {
                currentTrackId: null,
                currentTrackUri: null,
                currentTrackName: null,
                currentTrackAlbum: null,
                currentArtists: null,
                currentProgressMs: null,
                isPlaying: false,
              },
            });
          }
        } catch (err) {
          logger.warn(
            `[JamService] Failed to fetch playback for jam ${jam.id}:`,
            err.message,
          );
          // Keep existing playback data on error
        }
      }
    }

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
            sender_number: true,
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
                sender_number: true,
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

      // If user doesn't have Premium, remove them from the jam
      if (syncResult.error === "FORBIDDEN") {
        logger.info(
          `[JamService] Removing listener ${userId} from jam ${jamId} due to Premium requirement`,
        );

        // Remove user from jam
        await prisma.jamListener
          .update({
            where: {
              jamId_userId: {
                jamId,
                userId,
              },
            },
            data: {
              isActive: false,
            },
          })
          .catch((err) => {
            logger.error(
              `[JamService] Error removing listener ${userId}:`,
              err,
            );
          });

        // Return with special flag for notification
        return {
          success: false,
          error: "PREMIUM_REQUIRED",
          message:
            "Feature disponível somente para usuários com Spotify Premium",
          userRemoved: true,
        };
      }

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
        currentTrackAlbum: playbackData.album || null,
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
    const removedUsers = [];
    for (const listener of jam.listeners) {
      if (listener.isActive) {
        const syncResult = await syncListener(jamId, listener.userId);
        results.push({
          userId: listener.userId,
          success: syncResult.success,
          error: syncResult.error,
        });

        // Collect users removed due to Premium requirement
        if (syncResult.userRemoved && syncResult.error === "PREMIUM_REQUIRED") {
          removedUsers.push({
            userId: listener.userId,
            whatsappId: listener.user?.sender_number,
            message: syncResult.message,
          });
        }

        // Small delay between syncs to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    logger.info(
      `[JamService] Synced ${results.length} listeners for jam ${jamId}`,
    );

    if (removedUsers.length > 0) {
      logger.info(
        `[JamService] Removed ${removedUsers.length} users from jam ${jamId} due to Premium requirement`,
      );
    }

    return {
      success: true,
      results,
      removedUsers,
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
        host: {
          select: {
            id: true,
            sender_number: true,
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
                sender_number: true,
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
                sender_number: true,
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
                    sender_number: true,
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

/**
 * Close inactive jams (no playback for more than 30 minutes)
 */
async function closeInactiveJams() {
  try {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    // Find jams that haven't been active for 30 minutes
    const inactiveJams = await prisma.jamSession.findMany({
      where: {
        isActive: true,
        lastActiveAt: {
          lt: thirtyMinutesAgo,
        },
      },
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
          select: {
            id: true,
            userId: true,
          },
        },
      },
    });

    if (inactiveJams.length === 0) {
      return { success: true, closed: 0 };
    }

    // Close all inactive jams, but only if they have no active listeners
    const closedJamIds = [];
    for (const jam of inactiveJams) {
      const activeListenerCount = jam.listeners?.length || 0;

      // Skip closing if there are active listeners - they're still using the jam
      if (activeListenerCount > 0) {
        logger.info(
          `[JamService] Skipping jam ${jam.id} - has ${activeListenerCount} active listener(s) despite inactivity`,
        );
        continue;
      }

      await prisma.jamSession.update({
        where: { id: jam.id },
        data: { isActive: false },
      });

      // Mark all listeners as inactive
      await prisma.jamListener.updateMany({
        where: { jamId: jam.id },
        data: { isActive: false },
      });

      closedJamIds.push(jam.id);
      logger.info(
        `[JamService] Closed inactive jam ${jam.id} (host: ${jam.host.push_name || jam.host.display_name || jam.hostUserId})`,
      );
    }

    return {
      success: true,
      closed: closedJamIds.length,
      jamIds: closedJamIds,
    };
  } catch (err) {
    logger.error("[JamService] Error closing inactive jams:", err);
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
  closeInactiveJams,
};

/**
 * Skip current track on jam host's player and sync listeners
 * @param {string} jamId
 */
async function skipJam(jamId) {
  try {
    const jamResult = await getJamById(jamId);
    if (!jamResult.success) return jamResult;
    const jam = jamResult.jam;
    if (!jam || !jam.isActive) {
      return { success: false, error: "JAM_INACTIVE" };
    }

    const hostUserId = jam.hostUserId;

    // Find host's spotify account
    const account = await prisma.spotifyAccount.findFirst({
      where: { userId: hostUserId },
    });
    if (!account || !account.id) {
      return { success: false, error: "HOST_NO_SPOTIFY_ACCOUNT" };
    }

    // Call Spotify /me/player/next using host's account
    const res = await spotifyFetch(
      account.id,
      "https://api.spotify.com/v1/me/player/next",
      { method: "POST" },
    );

    if (res.status === 204 || res.status === 200) {
      // Sync all listeners
      await syncAllListeners(jamId);
      return { success: true };
    }

    // Map common Spotify errors
    if (res.status === 404) {
      return { success: false, error: "NO_ACTIVE_DEVICE" };
    }

    const text = await res.text().catch(() => null);
    return {
      success: false,
      error: `SPOTIFY_ERROR_${res.status}`,
      details: text,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// export skipJam
module.exports.skipJam = skipJam;
