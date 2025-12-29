-- CreateTable
CREATE TABLE "Playlist" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "spotifyId" TEXT,
    "accountId" TEXT,
    "coverUrl" TEXT,
    "isManaged" BOOLEAN NOT NULL DEFAULT true,
    "meta" JSON,
    "syncedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Playlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveRequest" (
    "id" TEXT NOT NULL,
    "trackId" TEXT,
    "userId" TEXT,
    "playlistId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledBySessionId" TEXT,
    "handledAt" TIMESTAMPTZ(6),
    "metadata" JSON,
    "archivedAt" TIMESTAMPTZ(6),

    CONSTRAINT "LiveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpotifySession" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "deviceId" TEXT,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMPTZ(6),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSON,

    CONSTRAINT "SpotifySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaylistSyncLog" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "attemptedBy" TEXT,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(6),
    "success" BOOLEAN DEFAULT false,
    "result" JSON,
    "errorMessage" TEXT,

    CONSTRAINT "PlaylistSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Playlist_accountId_idx" ON "Playlist"("accountId");

-- CreateIndex
CREATE INDEX "LiveRequest_createdAt_idx" ON "LiveRequest"("createdAt");

-- CreateIndex
CREATE INDEX "LiveRequest_status_idx" ON "LiveRequest"("status");

-- CreateIndex
CREATE INDEX "SpotifySession_accountId_isActive_idx" ON "SpotifySession"("accountId", "isActive");

-- CreateIndex
CREATE INDEX "SpotifySession_lastSeen_idx" ON "SpotifySession"("lastSeen");

-- CreateIndex
CREATE INDEX "PlaylistSyncLog_playlistId_idx" ON "PlaylistSyncLog"("playlistId");

-- CreateIndex
CREATE INDEX "PlaylistSyncLog_startedAt_idx" ON "PlaylistSyncLog"("startedAt");

-- AddForeignKey
ALTER TABLE "PlaylistEntry" ADD CONSTRAINT "PlaylistEntry_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SpotifyAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRequest" ADD CONSTRAINT "LiveRequest_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRequest" ADD CONSTRAINT "LiveRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRequest" ADD CONSTRAINT "LiveRequest_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRequest" ADD CONSTRAINT "LiveRequest_handledBySessionId_fkey" FOREIGN KEY ("handledBySessionId") REFERENCES "SpotifySession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotifySession" ADD CONSTRAINT "SpotifySession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SpotifyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistSyncLog" ADD CONSTRAINT "PlaylistSyncLog_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
