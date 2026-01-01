-- AlterTable
ALTER TABLE "Track" ADD COLUMN     "audioFeatures" JSON,
ADD COLUMN     "genres" TEXT[],
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "popularity" INTEGER,
ADD COLUMN     "releaseDate" TEXT;

-- AlterTable
ALTER TABLE "TrackPlayback" ADD COLUMN     "deviceType" TEXT,
ADD COLUMN     "isFirstPlay" BOOLEAN DEFAULT false,
ADD COLUMN     "sessionId" TEXT,
ADD COLUMN     "source" TEXT DEFAULT 'monitor',
ADD COLUMN     "wasRepeated" BOOLEAN DEFAULT false,
ADD COLUMN     "wasSkipped" BOOLEAN DEFAULT false;

-- CreateTable
CREATE TABLE "ListeningSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(6) NOT NULL,
    "endedAt" TIMESTAMPTZ(6),
    "trackCount" INTEGER NOT NULL DEFAULT 0,
    "totalMs" BIGINT NOT NULL DEFAULT 0,
    "deviceType" TEXT,
    "contextType" TEXT,

    CONSTRAINT "ListeningSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserYearSummary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "totalMinutes" INTEGER NOT NULL,
    "totalPlays" INTEGER NOT NULL,
    "uniqueTracks" INTEGER NOT NULL,
    "uniqueArtists" INTEGER NOT NULL,
    "uniqueAlbums" INTEGER NOT NULL,
    "topTracks" JSON,
    "topArtists" JSON,
    "topGenres" JSON,
    "topAlbums" JSON,
    "hourlyPattern" JSON,
    "weekdayPattern" JSON,
    "monthlyPattern" JSON,
    "avgDanceability" DOUBLE PRECISION,
    "avgEnergy" DOUBLE PRECISION,
    "avgValence" DOUBLE PRECISION,
    "avgTempo" DOUBLE PRECISION,
    "newArtistsCount" INTEGER,
    "newTracksCount" INTEGER,
    "topDiscoveries" JSON,
    "skipRate" DOUBLE PRECISION,
    "repeatRate" DOUBLE PRECISION,
    "avgSessionMinutes" DOUBLE PRECISION,
    "longestStreak" JSON,
    "computedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserYearSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListeningSession_userId_startedAt_idx" ON "ListeningSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "UserYearSummary_year_idx" ON "UserYearSummary"("year");

-- CreateIndex
CREATE UNIQUE INDEX "UserYearSummary_userId_year_key" ON "UserYearSummary"("userId", "year");

-- CreateIndex
CREATE INDEX "TrackPlayback_sessionId_idx" ON "TrackPlayback"("sessionId");

-- AddForeignKey
ALTER TABLE "TrackPlayback" ADD CONSTRAINT "TrackPlayback_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ListeningSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListeningSession" ADD CONSTRAINT "ListeningSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserYearSummary" ADD CONSTRAINT "UserYearSummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
