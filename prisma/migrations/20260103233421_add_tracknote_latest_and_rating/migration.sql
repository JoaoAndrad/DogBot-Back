-- AlterTable
ALTER TABLE "TrackNote" ADD COLUMN     "rating_decimal" DECIMAL(4,2);

-- AlterTable
ALTER TABLE "TrackStat" ADD COLUMN     "avgRating" DECIMAL(4,2),
ADD COLUMN     "ratingCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TrackNoteLatest" (
    "trackId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" DECIMAL(4,2),
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "TrackNoteLatest_pkey" PRIMARY KEY ("trackId","userId")
);

-- CreateIndex
CREATE INDEX "TrackNoteLatest_trackId_idx" ON "TrackNoteLatest"("trackId");

-- CreateIndex
CREATE INDEX "TrackNoteLatest_userId_idx" ON "TrackNoteLatest"("userId");

-- AddForeignKey
ALTER TABLE "TrackNoteLatest" ADD CONSTRAINT "TrackNoteLatest_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackNoteLatest" ADD CONSTRAINT "TrackNoteLatest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
