const { PrismaClient } = require("@prisma/client");
const fetch = require("node-fetch");
const playbackTracker = require("../domains/spotify/services/playbackTrackerService");

const prisma = new PrismaClient();

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

async function upsertAccountForUser({ userId }) {
  // If no userId provided, create a global account
  if (!userId) {
    const account = await prisma.spotifyAccount.create({
      data: {},
    });
    return account;
  }

  // The caller may pass an internal User.id (uuid) or an external sender number
  // Try resolving an internal user first; if not found, try sender_number lookup.
  let resolvedUser = null;
  try {
    resolvedUser = await prisma.user.findUnique({ where: { id: userId } });
  } catch (e) {
    // ignore
  }
  if (!resolvedUser) {
    try {
      resolvedUser = await prisma.user.findUnique({
        where: { sender_number: userId },
      });
    } catch (e) {
      // ignore
    }
  }

  if (resolvedUser) {
    const existing = await prisma.spotifyAccount.findFirst({
      where: { userId: resolvedUser.id },
    });
    if (existing) return existing;
    return prisma.spotifyAccount.create({
      data: { userId: resolvedUser.id },
    });
  }

  // Could not resolve a local User; create an account WITHOUT foreign key
  const account = await prisma.spotifyAccount.create({
    data: {},
  });
  return account;
}

async function upsertAccountTokens({
  accountId,
  userId,
  accessToken,
  refreshToken,
  expiresIn,
}) {
  // ensure account exists
  let account = null;
  if (accountId) {
    account = await prisma.spotifyAccount.findUnique({
      where: { id: accountId },
    });
  } else if (userId) {
    account = await prisma.spotifyAccount.findFirst({ where: { userId } });
  }
  if (!account) {
    account = await upsertAccountForUser({ userId });
  }

  const expiresAt = expiresIn
    ? new Date(Date.now() + Number(expiresIn) * 1000)
    : null;

  // Update the most recent token row when possible to avoid accumulating
  // many token rows. If none exists, create. After creating/updating, prune
  // other tokens older than the kept one.
  const latest = await prisma.spotifyToken.findFirst({
    where: { accountId: account.id },
    orderBy: { createdAt: "desc" },
  });

  let token = null;
  if (latest) {
    token = await prisma.spotifyToken.update({
      where: { id: latest.id },
      data: {
        accessToken: accessToken || latest.accessToken || "",
        refreshToken: refreshToken || latest.refreshToken || "",
        expiresAt,
      },
    });
  } else {
    token = await prisma.spotifyToken.create({
      data: {
        accountId: account.id,
        accessToken: accessToken || "",
        refreshToken: refreshToken || "",
        expiresAt,
      },
    });
  }

  // Prune older tokens for this account, keep only the token we just updated/created
  try {
    await prisma.spotifyToken.deleteMany({
      where: { accountId: account.id, id: { not: token.id } },
    });
  } catch (e) {
    // ignore prune errors (best-effort)
    console.warn(
      "spotifyService: prune tokens failed",
      e && e.message ? e.message : e
    );
  }

  return { account, token };
}

async function getLatestTokenByAccountId(accountId) {
  return prisma.spotifyToken.findFirst({
    where: { accountId },
    orderBy: { createdAt: "desc" },
  });
}

async function refreshTokenForAccount(accountId) {
  const tokenRow = await getLatestTokenByAccountId(accountId);
  if (!tokenRow || !tokenRow.refreshToken)
    throw new Error("No refresh token available");

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokenRow.refreshToken,
    client_id: process.env.SPOTIFY_CLIENT_ID,
    client_secret: process.env.SPOTIFY_CLIENT_SECRET,
  }).toString();

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));

  // Persist new token
  const expiresIn = json.expires_in || null;
  return upsertAccountTokens({
    accountId,
    accessToken: json.access_token,
    refreshToken: json.refresh_token || tokenRow.refreshToken,
    expiresIn,
    scope: json.scope,
  });
}

async function getValidAccessTokenForAccount(accountId) {
  const latest = await getLatestTokenByAccountId(accountId);
  if (!latest) return null;
  // margin: 5 minutes (avoid using tokens that will expire shortly)
  const MARGIN_MS = 5 * 60 * 1000;
  if (
    latest.expiresAt &&
    new Date(latest.expiresAt) > new Date(Date.now() + MARGIN_MS)
  ) {
    return latest.accessToken;
  }
  // expired or near-expiry: refresh
  const refreshed = await refreshTokenForAccount(accountId);
  return refreshed.token.accessToken;
}

// Wrapper for calling Spotify API using stored account tokens.
// Automatically refreshes once on 401 and retries.
async function spotifyFetch(accountId, url, options = {}) {
  if (!accountId) throw new Error("accountId is required for spotifyFetch");

  const token = await getValidAccessTokenForAccount(accountId);
  if (!token)
    throw new Error("No access token available for account " + accountId);

  if (!options.headers) options.headers = {};
  options.headers["Authorization"] = `Bearer ${token}`;

  let res = await fetch(url, options);

  if (res.status === 401) {
    // try refresh and retry once
    try {
      const refreshed = await refreshTokenForAccount(accountId);
      const newToken = refreshed.token.accessToken;
      options.headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(url, options);
    } catch (err) {
      // swallow refresh error and return original 401 response
      console.log("spotifyFetch: refresh failed", err);
    }
  }

  // Diagnostic logging for non-OK responses (except 401 handled above)
  try {
    if (!res.ok) {
      const text = await res.text().catch(() => null);
      console.warn(
        `[spotifyFetch] account=${accountId} url=${url} status=${
          res.status
        } body=${text ? text.slice(0, 1000) : "<no-body>"}`
      );
    }
  } catch (e) {
    console.warn("[spotifyFetch] failed to log response body", e && e.message);
  }

  return res;
}

module.exports = {
  prisma,
  upsertAccountForUser,
  upsertAccountTokens,
  getLatestTokenByAccountId,
  refreshTokenForAccount,
  getValidAccessTokenForAccount,
  spotifyFetch,
};

// -------------------------
// Persistence helpers for monitoring
// -------------------------

/**
 * Upsert current playback for an account (CurrentPlayback table)
 * trackData: { id, name, artists, album, progress_ms, duration_ms, image }
 */
async function upsertCurrentPlayback(accountId, trackData = {}) {
  if (!accountId) throw new Error("accountId required");

  const now = new Date();

  return prisma.currentPlayback.upsert({
    where: { accountId },
    create: {
      accountId,
      trackId: trackData.id || "",
      startedAt: now,
      metadata: trackData,
    },
    update: {
      trackId: trackData.id || "",
      updatedAt: now,
      metadata: trackData,
    },
  });
}

/**
 * Create a TrackPlayback entry. listenedMs is optional (calculated by monitor).
 */
async function createTrackPlayback({
  accountId,
  userId = null,
  trackId,
  deviceId = null,
  contextType = null,
  contextId = null,
  listenedMs = null,
  metadata = {},
}) {
  if (!accountId || !trackId) throw new Error("accountId and trackId required");

  return prisma.trackPlayback.create({
    data: {
      accountId,
      userId,
      trackId,
      deviceId,
      contextType,
      contextId,
      listenedMs: listenedMs !== null ? BigInt(listenedMs) : null,
      metadata,
    },
  });
}

/**
 * Fetch currently playing for a single user/account using a provided userSpotifyAPI
 * and persist results to DB using the playbackTracker service.
 * userSpotifyAPI must implement: getCurrentlyPlaying(userId) and getConnectedUsers()/getConnectionStatus
 */
async function fetchAndPersistUser({ accountId, userId, userSpotifyAPI }) {
  console.log(
    `[fetchAndPersistUser] START userId=${userId} accountId=${accountId}`
  );
  if (!userSpotifyAPI) throw new Error("userSpotifyAPI is required");

  const result = await userSpotifyAPI.getCurrentlyPlaying(userId);
  console.log(
    `[fetchAndPersistUser] getCurrentlyPlaying returned:`,
    result ? `playing=${result.playing} error=${!!result.error}` : "null"
  );

  // Resolve accountId if not provided
  let resolvedAccountId = accountId;
  if (!resolvedAccountId) {
    const account = await prisma.spotifyAccount.findFirst({
      where: { userId },
    });
    resolvedAccountId = account?.id;
  }

  // if error or not playing, return
  if (!result || result.error || result.playing === false) {
    // Diagnostic log to help identify why no playback was detected
    try {
      console.log(
        `[fetchAndPersistUser] no playback for user=${userId} account=${accountId} result=`,
        result && typeof result === "object"
          ? JSON.stringify(result).slice(0, 2000)
          : result
      );
    } catch (e) {
      console.warn(
        "[fetchAndPersistUser] failed to stringify result",
        e && e.message
      );
    }

    return { status: "no_music", detail: result };
  }

  // Extract track ID and prepare track data
  const trackId = result.url ? result.url.split("/").pop() : result.id || null;

  if (!trackId || !resolvedAccountId) {
    console.warn(
      `[fetchAndPersistUser] Missing trackId or accountId, skipping persist`
    );
    return { status: "playing", track: result };
  }

  // Use playbackTracker to record this playback
  try {
    await playbackTracker.recordPlayback({
      userId,
      accountId: resolvedAccountId,
      trackData: {
        id: trackId,
        name: result.name,
        artists: result.artists,
        album: result.album,
        duration_ms: result.duration_ms,
        progress_ms: result.progress_ms,
        is_playing: result.playing,
        image: result.image,
        popularity: result.popularity,
        explicit: result.explicit,
        preview_url: result.preview_url,
        device_type: result.device?.type,
        context: result.context,
      },
      deviceId: result.device?.id,
      progressMs: result.progress_ms,
    });
  } catch (err) {
    console.log(`[fetchAndPersistUser] playbackTracker error:`, err);
  }

  // Update current playback pointer
  await upsertCurrentPlayback(resolvedAccountId, {
    id: trackId,
    ...result,
  });

  return { status: "playing", track: result };
}

// export helpers
module.exports.upsertCurrentPlayback = upsertCurrentPlayback;
module.exports.createTrackPlayback = createTrackPlayback;
module.exports.fetchAndPersistUser = fetchAndPersistUser;
