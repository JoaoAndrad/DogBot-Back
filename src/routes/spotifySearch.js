const express = require("express");
const router = express.Router();
const { spotifyFetch } = require("../services/spotifyService");
const { prisma } = require("../services/spotifyService");
const logger = require("../lib/logger");

/**
 * GET /api/spotify/search
 * Search Spotify catalog
 * Query params: query, type (track, album, artist, playlist), limit
 */
router.get("/search", async (req, res, next) => {
  try {
    const { query, type = "track", limit = 10 } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "MISSING_QUERY",
        message: "Query parameter is required",
      });
    }

    // Get any active Spotify account to perform search
    // (Search doesn't require user-specific auth)
    const account = await prisma.spotifyAccount.findFirst({
      where: {
        tokens: {
          some: {
            expiresAt: { gt: new Date() },
          },
        },
      },
      include: {
        tokens: {
          where: {
            expiresAt: { gt: new Date() },
          },
          orderBy: {
            expiresAt: "desc",
          },
          take: 1,
        },
      },
    });

    if (!account || !account.tokens || account.tokens.length === 0) {
      return res.status(503).json({
        success: false,
        error: "NO_SPOTIFY_ACCOUNT",
        message: "No Spotify accounts available for search",
      });
    }

    // Build search URL
    const params = new URLSearchParams({
      q: query,
      type,
      limit: Math.min(parseInt(limit, 10) || 10, 50),
      market: "BR",
    });

    const searchUrl = `https://api.spotify.com/v1/search?${params}`;

    const response = await spotifyFetch(account.id, searchUrl);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        `[SpotifySearch] Error searching: ${response.status} - ${errorText}`,
      );
      return res.status(response.status).json({
        success: false,
        error: "SPOTIFY_ERROR",
        message: "Error searching Spotify",
        details: errorText,
      });
    }

    const data = await response.json();

    // Format tracks
    let tracks = [];
    if (data.tracks && data.tracks.items) {
      tracks = data.tracks.items.map((track) => ({
        id: track.id,
        uri: track.uri,
        name: track.name,
        artists: track.artists.map((a) => ({ name: a.name, id: a.id })),
        album: {
          name: track.album.name,
          id: track.album.id,
          images: track.album.images,
        },
        duration_ms: track.duration_ms,
        preview_url: track.preview_url,
        external_urls: track.external_urls,
      }));
    }

    res.json({
      success: true,
      tracks,
      total: data.tracks?.total || 0,
    });
  } catch (err) {
    logger.error("[SpotifySearch] Error:", err);
    next(err);
  }
});

module.exports = router;
