const env = process.env;
module.exports = {
  NODE_ENV: env.NODE_ENV || "development",
  PORT: env.PORT || 80,
  DATABASE_URL: env.DATABASE_URL || null,
  BOT_SECRET: env.BOT_SECRET || null,
  POLL_SHARED_SECRET: env.POLL_SHARED_SECRET || env.INTERNAL_API_SECRET || null,
};
