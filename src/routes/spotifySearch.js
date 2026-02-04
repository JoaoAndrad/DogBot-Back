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

/**
 * GET /api/spotify/playlist/:playlistId/tracks
 * Get tracks from a Spotify playlist
 */
router.get("/playlist/:playlistId/tracks", async (req, res, next) => {
  try {
    const { playlistId } = req.params;
    const { limit = 50 } = req.query;

    if (!playlistId) {
      return res.status(400).json({
        success: false,
        error: "MISSING_PLAYLIST_ID",
        message: "Playlist ID is required",
      });
    }

    // Get any active Spotify account to perform search
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
        message: "No Spotify accounts available",
      });
    }

    // Get playlist details
    const playlistUrl = `https://api.spotify.com/v1/playlists/${playlistId}`;
    const playlistResponse = await spotifyFetch(account.id, playlistUrl);

    if (!playlistResponse.ok) {
      const errorText = await playlistResponse.text();
      logger.error(
        `[SpotifySearch] Error fetching playlist: ${playlistResponse.status} - ${errorText}`,
      );
      return res.status(playlistResponse.status).json({
        success: false,
        error: "SPOTIFY_ERROR",
        message: "Error fetching playlist from Spotify",
        details: errorText,
      });
    }

    const playlistData = await playlistResponse.json();

    // Get playlist tracks
    const tracksUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${Math.min(parseInt(limit, 10) || 50, 100)}`;
    const tracksResponse = await spotifyFetch(account.id, tracksUrl);

    if (!tracksResponse.ok) {
      const errorText = await tracksResponse.text();
      logger.error(
        `[SpotifySearch] Error fetching playlist tracks: ${tracksResponse.status} - ${errorText}`,
      );
      return res.status(tracksResponse.status).json({
        success: false,
        error: "SPOTIFY_ERROR",
        message: "Error fetching playlist tracks from Spotify",
        details: errorText,
      });
    }

    const tracksData = await tracksResponse.json();

    // Format tracks
    const tracks = tracksData.items
      .filter((item) => item.track && !item.track.is_local)
      .map((item) => {
        const track = item.track;
        return {
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
        };
      });

    res.json({
      success: true,
      tracks,
      playlistName: playlistData.name,
      playlistDescription: playlistData.description,
      total: tracksData.total || 0,
    });
  } catch (err) {
    logger.error("[SpotifySearch] Error fetching playlist:", err);
    next(err);
  }
});

module.exports = router;
