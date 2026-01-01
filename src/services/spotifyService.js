const { PrismaClient } = require("@prisma/client");
const fetch = require("node-fetch");

const prisma = new PrismaClient();

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

async function upsertAccountForUser({
  userId,
  accountType = "bot",
  clientId = null,
  scope = null,
}) {
  // If no userId provided, create a bot/global account
  if (!userId) {
    const account = await prisma.spotifyAccount.create({
      data: { accountType, clientId, scope },
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
      resolvedUser = await prisma.user.findUnique({ where: { sender_number: userId } });
    } catch (e) {
      // ignore
    }
  }

  if (resolvedUser) {
    const existing = await prisma.spotifyAccount.findFirst({ where: { userId: resolvedUser.id } });
    if (existing) return existing;
    return prisma.spotifyAccount.create({
      data: { userId: resolvedUser.id, accountType, clientId, scope },
    });
  }

  // Could not resolve a local User; create an account WITHOUT foreign key to avoid FK constraint
  // Store the original identifier in `meta.externalId` for later reconciliation
  const account = await prisma.spotifyAccount.create({
    data: {
      accountType,
      clientId,
      scope,
      meta: { externalId: userId },
    },
  });
  return account;
}

async function upsertAccountTokens({
  accountId,
  userId,
  accountType = "bot",
  accessToken,
  refreshToken,
  expiresIn,
  scope,
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
    account = await upsertAccountForUser({
      userId,
      accountType,
      clientId: process.env.SPOTIFY_CLIENT_ID,
      scope,
    });
  }

  const expiresAt = expiresIn
    ? new Date(Date.now() + Number(expiresIn) * 1000)
    : null;

  // create a new token row for auditability (we keep all tokens)
  const token = await prisma.spotifyToken.create({
    data: {
      accountId: account.id,
      accessToken: accessToken || "",
      refreshToken: refreshToken || "",
      scope: scope || null,
      expiresAt,
    },
  });

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
      console.error("spotifyFetch: refresh failed", err);
    }
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
 * Update or create a SpotifySession for an account and device
 */
async function upsertSession({
  accountId,
  deviceId = null,
  lastSeen = new Date(),
  isActive = true,
  metadata = {},
}) {
  if (!accountId) throw new Error("accountId required");

  // Try to find session by accountId + deviceId
  const where = deviceId
    ? { accountId_deviceId: { accountId, deviceId } }
    : null;

  if (where) {
    // ensure compound unique index exists? use findFirst then upsert
    const existing = await prisma.spotifySession.findFirst({
      where: { accountId, deviceId },
    });
    if (existing) {
      return prisma.spotifySession.update({
        where: { id: existing.id },
        data: { lastSeen, isActive, metadata },
      });
    }
  }

  return prisma.spotifySession.create({
    data: { accountId, deviceId, lastSeen, isActive, metadata },
  });
}

/**
 * Fetch currently playing for a single user/account using a provided userSpotifyAPI
 * and persist results to DB.
 * userSpotifyAPI must implement: getCurrentlyPlaying(userId) and getConnectedUsers()/getConnectionStatus
 */
async function fetchAndPersistUser({ accountId, userId, userSpotifyAPI }) {
  if (!userSpotifyAPI) throw new Error("userSpotifyAPI is required");

  const result = await userSpotifyAPI.getCurrentlyPlaying(userId);

  // if error or not playing, update session lastSeen and return
  const now = new Date();

  await upsertSession({
    accountId,
    deviceId: null,
    lastSeen: now,
    isActive: !!result.playing,
  });

  if (!result || result.error || result.playing === false) {
    return { status: "no_music", detail: result };
  }

  // persist current playback and a playback record (listenedMs unknown here)
  const trackId = result.url ? result.url.split("/").pop() : result.id || null;

  // Upsert track entity if not exists (best-effort)
  if (trackId) {
    try {
      await prisma.track.upsert({
        where: { id: trackId },
        create: {
          id: trackId,
          name: result.name || null,
          album: result.album || null,
          artists: result.artists ? JSON.stringify(result.artists) : null,
          metadata: result,
        },
        update: {
          name: result.name || null,
          album: result.album || null,
          metadata: result,
        },
      });
    } catch (e) {
      // ignore upsert errors
      console.warn("track upsert failed", e.message);
    }
  }

  // create a playback record with a conservative listenedMs = progress_ms or null
  const listenedMs = result.progress_ms || null;
  await createTrackPlayback({
    accountId,
    userId,
    trackId: trackId || result.id || "",
    listenedMs,
    metadata: result,
  });

  await upsertCurrentPlayback(accountId, {
    id: trackId || result.id || "",
    ...result,
  });

  return { status: "playing", track: result };
}

// export helpers
module.exports.upsertCurrentPlayback = upsertCurrentPlayback;
module.exports.createTrackPlayback = createTrackPlayback;
module.exports.upsertSession = upsertSession;
module.exports.fetchAndPersistUser = fetchAndPersistUser;
