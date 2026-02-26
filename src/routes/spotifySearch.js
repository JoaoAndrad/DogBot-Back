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
      limit: Math.min(parseInt(limit, 10) || 5, 10),
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
    const tracksUrl = `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=${Math.min(parseInt(limit, 10) || 50, 100)}`;
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
      .filter((item) => item.item && !item.item.is_local)
      .map((item) => {
        const track = item.item;
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

/**
 * GET /api/spotify/album/:albumId
 * Get album details and tracks from Spotify
 */
router.get("/album/:albumId", async (req, res, next) => {
  try {
    const { albumId } = req.params;
    const { limit = 50 } = req.query;

    if (!albumId) {
      return res.status(400).json({
        success: false,
        error: "MISSING_ALBUM_ID",
        message: "Album ID is required",
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

    // Get album details
    const albumUrl = `https://api.spotify.com/v1/albums/${albumId}`;
    const albumResponse = await spotifyFetch(account.id, albumUrl);

    if (!albumResponse.ok) {
      const errorText = await albumResponse.text();
      logger.error(
        `[SpotifySearch] Error fetching album: ${albumResponse.status} - ${errorText}`,
      );
      return res.status(albumResponse.status).json({
        success: false,
        error: "SPOTIFY_ERROR",
        message: "Error fetching album from Spotify",
        details: errorText,
      });
    }

    const albumData = await albumResponse.json();

    // Format tracks
    const tracks = albumData.tracks.items
      .filter((track) => track && !track.is_local)
      .map((track) => {
        return {
          id: track.id,
          uri: track.uri,
          name: track.name,
          artists: track.artists.map((a) => ({ name: a.name, id: a.id })),
          album: {
            name: albumData.name,
            id: albumData.id,
            images: albumData.images,
          },
          duration_ms: track.duration_ms,
          preview_url: track.preview_url,
          external_urls: track.external_urls,
        };
      });

    res.json({
      success: true,
      album: {
        id: albumData.id,
        name: albumData.name,
        artists: albumData.artists.map((a) => ({ name: a.name, id: a.id })),
        images: albumData.images,
        release_date: albumData.release_date,
        total_tracks: albumData.total_tracks,
        tracks: {
          items: tracks,
          total: albumData.tracks.total,
        },
      },
    });
  } catch (err) {
    logger.error("[SpotifySearch] Error fetching album:", err);
    next(err);
  }
});

/**
 * GET /api/spotify/track/:trackId
 * Get track details from Spotify
 */
router.get("/track/:trackId", async (req, res, next) => {
  try {
    const { trackId } = req.params;

    if (!trackId) {
      return res.status(400).json({
        success: false,
        error: "MISSING_TRACK_ID",
        message: "Track ID is required",
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

    // Get track details
    const trackUrl = `https://api.spotify.com/v1/tracks/${trackId}`;
    const trackResponse = await spotifyFetch(account.id, trackUrl);

    if (!trackResponse.ok) {
      const errorText = await trackResponse.text();
      logger.error(
        `[SpotifySearch] Error fetching track: ${trackResponse.status} - ${errorText}`,
      );
      return res.status(trackResponse.status).json({
        success: false,
        error: "SPOTIFY_ERROR",
        message: "Error fetching track from Spotify",
        details: errorText,
      });
    }

    const trackData = await trackResponse.json();

    // Format track
    const track = {
      id: trackData.id,
      uri: trackData.uri,
      name: trackData.name,
      artists: trackData.artists.map((a) => ({ name: a.name, id: a.id })),
      album: {
        name: trackData.album.name,
        id: trackData.album.id,
        images: trackData.album.images,
      },
      duration_ms: trackData.duration_ms,
      preview_url: trackData.preview_url,
      external_urls: trackData.external_urls,
      popularity: trackData.popularity,
    };

    res.json({
      success: true,
      track,
    });
  } catch (err) {
    logger.error("[SpotifySearch] Error fetching track:", err);
    next(err);
  }
});

module.exports = router;
