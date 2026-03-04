-- Migration: per-app Spotify rate limit
-- SpotifyRateLimit.id is now used as appIndex (0-based), set explicitly by code.
-- Remove the old DEFAULT 1 so new rows must supply an explicit id.
ALTER TABLE "SpotifyRateLimit" ALTER COLUMN "id" DROP DEFAULT;

-- Delete the old global singleton row (id=1).
-- It was a single shared block for all apps; the new model uses id=appIndex.
-- If app 1 was genuinely blocked it will repopulate automatically on the next 429.
DELETE FROM "SpotifyRateLimit" WHERE id = 1;
