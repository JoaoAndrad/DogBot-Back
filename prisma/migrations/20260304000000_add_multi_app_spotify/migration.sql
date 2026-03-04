-- Add appIndex to SpotifyAccount: tracks which Spotify developer app owns this account (0-based)
ALTER TABLE "SpotifyAccount" ADD COLUMN "appIndex" INTEGER NOT NULL DEFAULT 0;

-- Add appIndex to SpotifyAuthSession: records which app initiated the OAuth flow
ALTER TABLE "SpotifyAuthSession" ADD COLUMN "appIndex" INTEGER;
