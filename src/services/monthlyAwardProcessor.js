const cron = require("node-cron");
const workoutService = require("./workoutService");
const logger = require("../lib/logger");

/**
 * Start the monthly award processor
 * Runs on the 1st day of each month at 00:05 (São Paulo timezone)
 */
function startMonthlyAwardProcessor() {
  // Run on day 1 of each month at 00:05 (São Paulo timezone)
  // Cron format: minute hour day month weekday
  // 5 0 1 * * = 00:05 on day 1 of every month

  cron.schedule(
    "5 0 1 * *",
    async () => {
      logger.info(
        "[MonthlyAward] Starting monthly award processing at 00:05 (São Paulo timezone)...",
      );
      try {
        const result = await workoutService.processMonthlyAwards();
        logger.info(
          `[MonthlyAward] Completed - processed ${result.processed} groups for month ${result.month}`,
        );
      } catch (err) {
        logger.error("[MonthlyAward] Error processing awards:", err);
      }
    },
    {
      timezone: "America/Sao_Paulo",
    },
  );

  logger.info(
    "[MonthlyAward] Processor scheduled (day 1 at 00:05, America/Sao_Paulo)",
  );
}

module.exports = { startMonthlyAwardProcessor };
