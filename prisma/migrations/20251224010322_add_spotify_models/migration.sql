-- CreateTable
CREATE TABLE "SpotifyAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "accountType" TEXT NOT NULL DEFAULT 'bot',
    "clientId" TEXT,
    "scope" TEXT,
    "meta" JSON,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SpotifyAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpotifyToken" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "scope" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SpotifyToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Track" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "artists" JSON,
    "album" TEXT,
    "durationMs" INTEGER,
    "metadata" JSON,

    CONSTRAINT "Track_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackPlayback" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT,
    "trackId" TEXT NOT NULL,
    "deviceId" TEXT,
    "contextType" TEXT,
    "contextId" TEXT,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(6),
    "listenedMs" BIGINT,
    "percentPlayed" DOUBLE PRECISION,
    "metadata" JSON,

    CONSTRAINT "TrackPlayback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurrentPlayback" (
    "accountId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "metadata" JSON,

    CONSTRAINT "CurrentPlayback_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "TrackStat" (
    "trackId" TEXT NOT NULL,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "totalListenMs" BIGINT NOT NULL DEFAULT 0,
    "avgSessionMs" INTEGER,
    "lastPlayedAt" TIMESTAMPTZ(6),

    CONSTRAINT "TrackStat_pkey" PRIMARY KEY ("trackId")
);

-- CreateTable
CREATE TABLE "UserListeningSummary" (
    "userId" TEXT NOT NULL,
    "totalListenMs" BIGINT NOT NULL DEFAULT 0,
    "dailyListen" JSON,
    "lastUpdatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "UserListeningSummary_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "TrackVote" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vote" INTEGER NOT NULL,
    "contextId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackNote" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "note" TEXT,
    "rating" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "TrackNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaylistEntry" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "addedByUserId" TEXT,
    "addedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "position" INTEGER,
    "metadata" JSON,

    CONSTRAINT "PlaylistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpotifyAccount_userId_idx" ON "SpotifyAccount"("userId");

-- CreateIndex
CREATE INDEX "SpotifyToken_accountId_idx" ON "SpotifyToken"("accountId");

-- CreateIndex
CREATE INDEX "SpotifyToken_expiresAt_idx" ON "SpotifyToken"("expiresAt");

-- CreateIndex
CREATE INDEX "TrackPlayback_trackId_startedAt_idx" ON "TrackPlayback"("trackId", "startedAt");

-- CreateIndex
CREATE INDEX "TrackPlayback_userId_idx" ON "TrackPlayback"("userId");

-- CreateIndex
CREATE INDEX "TrackStat_lastPlayedAt_idx" ON "TrackStat"("lastPlayedAt");

-- CreateIndex
CREATE INDEX "TrackVote_trackId_idx" ON "TrackVote"("trackId");

-- CreateIndex
CREATE INDEX "TrackVote_userId_idx" ON "TrackVote"("userId");

-- CreateIndex
CREATE INDEX "TrackNote_trackId_idx" ON "TrackNote"("trackId");

-- CreateIndex
CREATE INDEX "TrackNote_userId_idx" ON "TrackNote"("userId");

-- CreateIndex
CREATE INDEX "PlaylistEntry_playlistId_idx" ON "PlaylistEntry"("playlistId");

-- CreateIndex
CREATE INDEX "PlaylistEntry_addedByUserId_idx" ON "PlaylistEntry"("addedByUserId");

-- AddForeignKey
ALTER TABLE "SpotifyAccount" ADD CONSTRAINT "SpotifyAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotifyToken" ADD CONSTRAINT "SpotifyToken_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SpotifyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackPlayback" ADD CONSTRAINT "TrackPlayback_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SpotifyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackPlayback" ADD CONSTRAINT "TrackPlayback_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackPlayback" ADD CONSTRAINT "TrackPlayback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrentPlayback" ADD CONSTRAINT "CurrentPlayback_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SpotifyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackStat" ADD CONSTRAINT "TrackStat_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserListeningSummary" ADD CONSTRAINT "UserListeningSummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackVote" ADD CONSTRAINT "TrackVote_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackVote" ADD CONSTRAINT "TrackVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackNote" ADD CONSTRAINT "TrackNote_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackNote" ADD CONSTRAINT "TrackNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistEntry" ADD CONSTRAINT "PlaylistEntry_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistEntry" ADD CONSTRAINT "PlaylistEntry_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
