-- CreateTable
CREATE TABLE "SpotifyRateLimit" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "blockedUntil" TIMESTAMPTZ(6),
    "retryAfterHeader" TEXT,
    "lastUpdated" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpotifyRateLimit_pkey" PRIMARY KEY ("id")
);
