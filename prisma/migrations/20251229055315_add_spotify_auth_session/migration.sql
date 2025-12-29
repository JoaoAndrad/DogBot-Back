-- CreateTable
CREATE TABLE "SpotifyAuthSession" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "userId" TEXT,
    "accountId" TEXT,
    "redirectAfter" TEXT,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSON,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpotifyAuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpotifyAuthSession_state_key" ON "SpotifyAuthSession"("state");

-- CreateIndex
CREATE INDEX "SpotifyAuthSession_userId_idx" ON "SpotifyAuthSession"("userId");

-- CreateIndex
CREATE INDEX "SpotifyAuthSession_accountId_idx" ON "SpotifyAuthSession"("accountId");
