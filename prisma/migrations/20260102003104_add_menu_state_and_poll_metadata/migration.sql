-- AlterTable
ALTER TABLE "Poll" ADD COLUMN     "metadata" JSON;

-- CreateTable
CREATE TABLE "MenuState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "history" JSON,
    "context" JSON,
    "expiresAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "MenuState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MenuState_expiresAt_idx" ON "MenuState"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MenuState_userId_flowId_key" ON "MenuState"("userId", "flowId");
