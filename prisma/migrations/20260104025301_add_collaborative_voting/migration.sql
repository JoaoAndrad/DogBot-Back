-- CreateTable
CREATE TABLE "GroupChat" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "name" TEXT,
    "playlistId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSON,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "GroupChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollaborativeVote" (
    "id" TEXT NOT NULL,
    "groupChatId" TEXT NOT NULL,
    "pollId" TEXT,
    "voteType" TEXT NOT NULL,
    "trackId" TEXT,
    "trackName" TEXT,
    "trackArtists" TEXT,
    "initiatorUserId" TEXT NOT NULL,
    "targetUserIds" JSON NOT NULL,
    "votesFor" JSON NOT NULL,
    "votesAgainst" JSON NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "expiresAt" TIMESTAMPTZ(6),
    "resolvedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollaborativeVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupChat_chatId_key" ON "GroupChat"("chatId");

-- CreateIndex
CREATE INDEX "GroupChat_chatId_idx" ON "GroupChat"("chatId");

-- CreateIndex
CREATE INDEX "GroupChat_playlistId_idx" ON "GroupChat"("playlistId");

-- CreateIndex
CREATE INDEX "CollaborativeVote_groupChatId_status_idx" ON "CollaborativeVote"("groupChatId", "status");

-- CreateIndex
CREATE INDEX "CollaborativeVote_pollId_idx" ON "CollaborativeVote"("pollId");

-- CreateIndex
CREATE INDEX "CollaborativeVote_expiresAt_idx" ON "CollaborativeVote"("expiresAt");

-- AddForeignKey
ALTER TABLE "GroupChat" ADD CONSTRAINT "GroupChat_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaborativeVote" ADD CONSTRAINT "CollaborativeVote_groupChatId_fkey" FOREIGN KEY ("groupChatId") REFERENCES "GroupChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaborativeVote" ADD CONSTRAINT "CollaborativeVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE SET NULL ON UPDATE CASCADE;
