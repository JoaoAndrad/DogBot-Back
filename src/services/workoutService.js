const { getPrisma } = require("../db");
const userRepo = require("../domains/users/repo/userRepo");
const {
  getTodayBR,
  getCurrentMonthKeyBR,
  getCurrentYearBR,
  getLastMonthKeyBR,
  getMonthNameBR,
  nowInSaoPaulo,
  TIMEZONE,
} = require("../utils/dateHelper");
const { DateTime } = require("luxon");
const logger = require("../lib/logger");

// Get Prisma client instance
const prisma = getPrisma();

/**
 * Log a workout for a user
 * @param {Object} params - Workout parameters
 * @param {string} params.senderNumber - User's WhatsApp number
 * @param {string} params.chatId - Group chat ID where workout was logged
 * @param {string} params.messageId - WhatsApp message ID
 * @param {string} params.note - Optional workout note/description
 * @param {string} params.loggedAt - ISO timestamp when workout was logged
 * @returns {Object} Result object with success status and stats
 */
async function logWorkout({ senderNumber, chatId, messageId, note, loggedAt }) {
  try {
    // Resolve user
    const user = await userRepo.findByIdentifierExact(senderNumber);
    if (!user) {
      return { success: false, error: "user_not_found" };
    }

    // Get today in São Paulo timezone
    const today = getTodayBR(); // "19/02/2026"
    const monthKey = getCurrentMonthKeyBR(); // "02/2026"
    const year = getCurrentYearBR(); // 2026

    // Check for duplicate workout today
    const existingWorkout = await prisma.workoutLog.findFirst({
      where: {
        user_id: user.id,
        workout_date: today,
      },
    });

    if (existingWorkout) {
      return {
        success: false,
        error: "workout_already_logged_today",
        message: "Você já registrou treino hoje! 💪",
      };
    }

    // Get or create UserFitness
    let fitness = await prisma.userFitness.findUnique({
      where: { user_id: user.id },
    });

    if (!fitness) {
      fitness = await prisma.userFitness.create({
        data: { user_id: user.id },
      });
    }

    // Calculate streak
    const streak = await calculateStreak(user.id, fitness);

    // Create WorkoutLog
    const workout = await prisma.workoutLog.create({
      data: {
        fitness_id: fitness.id,
        user_id: user.id,
        workout_date: today,
        month_key: monthKey,
        year,
        chat_id: chatId,
        message_id: messageId,
        note: note || null,
        points_earned: 1,
        streak_at_time: streak,
      },
    });

    // Update UserFitness
    await prisma.userFitness.update({
      where: { id: fitness.id },
      data: {
        total_workouts: { increment: 1 },
        current_streak: streak,
        longest_streak: Math.max(fitness.longest_streak || 0, streak),
        last_workout_at: nowInSaoPaulo().toJSDate(),
      },
    });

    // Get month workouts count
    const monthWorkouts = await getMonthWorkouts(user.id, monthKey);

    // Format success message
    const userName = user.display_name || user.push_name || "Usuário";
    const successMessage = `✅ Treino registrado com sucesso!\n\n👤 Usuário: ${userName}\n📅 Data: ${today}\n🏋️‍♂️ Pontuação atual: ${monthWorkouts}\n🔥 Sequência: ${streak}`;

    return {
      success: true,
      message: successMessage,
      stats: {
        streak,
        total_workouts: fitness.total_workouts + 1,
        monthWorkouts,
      },
    };
  } catch (error) {
    logger.error("[workoutService] Error logging workout:", error);
    throw error;
  }
}

/**
 * Calculate user's current streak
 * @param {string} userId - User ID
 * @param {Object} fitness - UserFitness record
 * @returns {number} Current streak count
 */
async function calculateStreak(userId, fitness) {
  if (!fitness.last_workout_at) {
    return 1; // First workout
  }

  const today = nowInSaoPaulo().startOf("day");
  const lastWorkout = DateTime.fromJSDate(new Date(fitness.last_workout_at), {
    zone: TIMEZONE,
  }).startOf("day");

  const diff = Math.floor(today.diff(lastWorkout, "days").days);

  if (diff === 1) {
    // Consecutive day
    return (fitness.current_streak || 0) + 1;
  } else {
    // Streak broken
    return 1;
  }
}

/**
 * Get workout count for a specific month
 * @param {string} userId - User ID
 * @param {string} monthKey - Month key in MM/YYYY format
 * @returns {number} Number of workouts in that month
 */
async function getMonthWorkouts(userId, monthKey) {
  return await prisma.workoutLog.count({
    where: {
      user_id: userId,
      month_key: monthKey,
    },
  });
}

/**
 * Get monthly ranking for a group, filtered by current members
 * @param {string} groupChatId - Group chat ID
 * @param {string} monthKey - Month key in MM/YYYY format (optional, defaults to current month)
 * @param {string[]} currentMemberIds - Array of WhatsApp numbers of current group members
 * @returns {Array} Ranking array with user stats
 */
async function getMonthlyRankingForGroup(
  groupChatId,
  monthKey,
  currentMemberIds,
) {
  try {
    const targetMonth = monthKey || getCurrentMonthKeyBR();

    // Get all workouts for this group in this month
    const workouts = await prisma.workoutLog.groupBy({
      by: ["user_id"],
      where: {
        chat_id: groupChatId,
        month_key: targetMonth,
      },
      _count: { id: true },
    });

    // Resolve users and filter by current members
    const ranking = [];

    for (const w of workouts) {
      const user = await prisma.user.findUnique({
        where: { id: w.user_id },
        select: {
          id: true,
          sender_number: true,
          display_name: true,
          push_name: true,
        },
      });

      if (!user) continue;

      // Check if user is current member
      const isMember = currentMemberIds.some((memberId) => {
        const cleanMemberId = memberId.replace(/@c\.us$/i, "");
        const cleanSenderNumber = user.sender_number.replace(/@c\.us$/i, "");
        return (
          cleanSenderNumber === cleanMemberId ||
          cleanSenderNumber.includes(cleanMemberId) ||
          cleanMemberId.includes(cleanSenderNumber)
        );
      });

      if (!isMember) continue;

      // Count trophies for this group
      const trophiesInGroup = await prisma.groupTrophy.count({
        where: {
          group_chat_id: groupChatId,
          user_id: user.id,
        },
      });

      // Get fitness data for annual goal and progress
      const fitness = await prisma.userFitness.findUnique({
        where: { user_id: user.id },
        select: {
          annual_goal: true,
          goal_is_public: true,
        },
      });

      // Get year workouts count if goal is public
      let yearWorkouts = null;
      let annualGoal = null;
      if (fitness && fitness.goal_is_public && fitness.annual_goal) {
        yearWorkouts = await getYearWorkouts(user.id);
        annualGoal = fitness.annual_goal;
      }

      ranking.push({
        userId: user.id,
        senderNumber: user.sender_number,
        name: user.display_name || user.push_name || "Usuário",
        monthWorkouts: w._count.id,
        trophiesInGroup,
        yearWorkouts,
        annualGoal,
      });
    }

    // Sort by workouts DESC, then by name
    ranking.sort((a, b) => {
      if (b.monthWorkouts !== a.monthWorkouts) {
        return b.monthWorkouts - a.monthWorkouts;
      }
      return a.name.localeCompare(b.name);
    });

    // Add rank
    ranking.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return ranking;
  } catch (error) {
    logger.error("[workoutService] Error getting ranking:", error);
    throw error;
  }
}

/**
 * Get season winners history for a group
 * @param {string} groupChatId - Group chat ID
 * @param {number} year - Year to get history for (optional, defaults to current year)
 * @returns {Object} Winners grouped by month
 */
async function getSeasonWinnersHistory(groupChatId, year) {
  try {
    const targetYear = year || getCurrentYearBR();

    const trophies = await prisma.groupTrophy.findMany({
      where: {
        group_chat_id: groupChatId,
        year: targetYear,
      },
      include: {
        user: {
          select: {
            id: true,
            display_name: true,
            push_name: true,
          },
        },
      },
      orderBy: { month_key: "asc" },
    });

    // Group by month_key
    const history = {};
    for (const trophy of trophies) {
      if (!history[trophy.month_key]) {
        history[trophy.month_key] = [];
      }
      history[trophy.month_key].push({
        userId: trophy.user_id,
        name: trophy.user.display_name || trophy.user.push_name || "Usuário",
        workouts: trophy.workouts_count,
      });
    }

    return history;
  } catch (error) {
    logger.error("[workoutService] Error getting winners history:", error);
    throw error;
  }
}

/**
 * Process monthly awards for all groups
 * Awards trophies to winners of the previous month
 * @returns {Object} Summary of processing
 */
async function processMonthlyAwards() {
  try {
    const lastMonthKey = getLastMonthKeyBR(); // "01/2026"
    const lastMonthName = getMonthNameBR(lastMonthKey); // "Janeiro"
    const [month, year] = lastMonthKey.split("/");

    logger.info(
      `[workoutService] Processing monthly awards for ${lastMonthKey}`,
    );

    // Get all groups with tracking enabled
    const groups = await prisma.groupChat.findMany({
      where: { workoutTrackingEnabled: true },
    });

    let processedCount = 0;

    for (const group of groups) {
      // Check if already processed
      if (group.lastMonthProcessed === lastMonthKey) {
        logger.debug(
          `[workoutService] Group ${group.chatId} already processed for ${lastMonthKey}`,
        );
        continue;
      }

      // Get all workouts from last month (no member filter for awards)
      const workouts = await prisma.workoutLog.groupBy({
        by: ["user_id"],
        where: {
          chat_id: group.chatId,
          month_key: lastMonthKey,
        },
        _count: { id: true },
      });

      if (workouts.length === 0) {
        // No workouts, just mark as processed
        await prisma.groupChat.update({
          where: { id: group.id },
          data: { lastMonthProcessed: lastMonthKey },
        });
        logger.debug(
          `[workoutService] No workouts in group ${group.chatId} for ${lastMonthKey}`,
        );
        continue;
      }

      // Find max workouts
      const maxWorkouts = Math.max(...workouts.map((w) => w._count.id));

      // Get all winners (support ties)
      const winners = workouts.filter((w) => w._count.id === maxWorkouts);

      logger.info(
        `[workoutService] Group ${group.chatId}: ${winners.length} winner(s) with ${maxWorkouts} workouts`,
      );

      // Create trophies
      for (const winner of winners) {
        const fitness = await prisma.userFitness.findUnique({
          where: { user_id: winner.user_id },
        });

        if (!fitness) {
          logger.warn(
            `[workoutService] No fitness record for user ${winner.user_id}`,
          );
          continue;
        }

        await prisma.groupTrophy.create({
          data: {
            group_chat_id: group.chatId,
            user_id: winner.user_id,
            fitness_id: fitness.id,
            month_key: lastMonthKey,
            year: parseInt(year),
            month_name: lastMonthName,
            workouts_count: maxWorkouts,
            was_tie: winners.length > 1,
          },
        });
      }

      // Update group
      await prisma.groupChat.update({
        where: { id: group.id },
        data: {
          lastMonthProcessed: lastMonthKey,
          currentSeason: parseInt(year),
        },
      });

      processedCount++;
    }

    logger.info(
      `[workoutService] Monthly awards completed: ${processedCount} groups processed`,
    );
    return { processed: processedCount, month: lastMonthKey };
  } catch (error) {
    logger.error("[workoutService] Error processing monthly awards:", error);
    throw error;
  }
}

/**
 * Get user's complete workout history
 * @param {string} senderNumber - User's WhatsApp number
 * @param {Object} options - Query options
 * @returns {Array} Array of workout records
 */
async function getUserWorkoutHistory(senderNumber, options = {}) {
  try {
    const user = await userRepo.findByIdentifierExact(senderNumber);
    if (!user) {
      return [];
    }

    const where = { user_id: user.id };

    if (options.startDate) {
      where.workout_date = { gte: options.startDate };
    }
    if (options.endDate) {
      where.workout_date = { ...where.workout_date, lte: options.endDate };
    }
    if (options.groupId) {
      where.chat_id = options.groupId;
    }

    const workouts = await prisma.workoutLog.findMany({
      where,
      orderBy: { logged_at: "desc" },
      take: options.limit || 100,
      skip: options.offset || 0,
    });

    return workouts;
  } catch (error) {
    logger.error("[workoutService] Error getting workout history:", error);
    throw error;
  }
}

/**
 * Get user's workout statistics
 * @param {string} senderNumber - User's WhatsApp number
 * @returns {Object} User statistics
 */
async function getUserStats(senderNumber) {
  try {
    const user = await userRepo.findByIdentifierExact(senderNumber);
    if (!user) {
      return null;
    }

    const fitness = await prisma.userFitness.findUnique({
      where: { user_id: user.id },
    });

    if (!fitness) {
      return {
        total_workouts: 0,
        current_streak: 0,
        longest_streak: 0,
        this_month: 0,
        last_workout_at: null,
      };
    }

    const currentMonthKey = getCurrentMonthKeyBR();
    const thisMonth = await getMonthWorkouts(user.id, currentMonthKey);

    return {
      total_workouts: fitness.total_workouts,
      current_streak: fitness.current_streak,
      longest_streak: fitness.longest_streak,
      this_month: thisMonth,
      last_workout_at: fitness.last_workout_at,
    };
  } catch (error) {
    logger.error("[workoutService] Error getting user stats:", error);
    throw error;
  }
}

/**
 * Set annual workout goal for a user
 * @param {string} senderNumber - User's WhatsApp number
 * @param {number} annualGoal - Goal between 1-365
 * @param {boolean} isPublic - Whether goal should be visible to others
 * @returns {Object} Result object
 */
async function setAnnualGoal(senderNumber, annualGoal, isPublic = false) {
  try {
    const user = await userRepo.findByIdentifierExact(senderNumber);
    if (!user) {
      return { success: false, error: "user_not_found" };
    }

    // Get or create UserFitness
    let fitness = await prisma.userFitness.findUnique({
      where: { user_id: user.id },
    });

    if (!fitness) {
      fitness = await prisma.userFitness.create({
        data: { user_id: user.id },
      });
    }

    // Update goal
    await prisma.userFitness.update({
      where: { id: fitness.id },
      data: {
        annual_goal: annualGoal,
        goal_is_public: isPublic,
      },
    });

    return {
      success: true,
      message: `✅ Meta anual definida: ${annualGoal} treinos! Vamos juntos nessa jornada! 💪`,
      goal: annualGoal,
      isPublic,
    };
  } catch (error) {
    logger.error("[workoutService] Error setting annual goal:", error);
    throw error;
  }
}

/**
 * Get year workouts count for a user
 * @param {string} userId - User ID
 * @param {number} year - Year (optional, defaults to current year)
 * @returns {number} Number of workouts in that year
 */
async function getYearWorkouts(userId, year) {
  const targetYear = year || getCurrentYearBR();
  return await prisma.workoutLog.count({
    where: {
      user_id: userId,
      year: targetYear,
    },
  });
}

module.exports = {
  logWorkout,
  calculateStreak,
  getMonthWorkouts,
  getMonthlyRankingForGroup,
  getSeasonWinnersHistory,
  processMonthlyAwards,
  getUserStats,
  getUserWorkoutHistory,
  setAnnualGoal,
  getYearWorkouts,
  getUserWorkoutHistory,
  getUserStats,
};
