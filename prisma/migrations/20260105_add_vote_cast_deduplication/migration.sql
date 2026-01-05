-- Add a processed flag to CollaborativeVote to prevent duplicate resolution
ALTER TABLE "CollaborativeVote" 
ADD COLUMN IF NOT EXISTS "processed" BOOLEAN DEFAULT false;

-- Add index for faster resolution queries
CREATE INDEX IF NOT EXISTS "CollaborativeVote_status_processed_idx" 
ON "CollaborativeVote"("status", "processed");

-- Note: Since votesFor and votesAgainst are JSON arrays, we can't add a DB-level
-- unique constraint. The application logic must enforce idempotency by checking
-- if userId already exists in the array before adding.
