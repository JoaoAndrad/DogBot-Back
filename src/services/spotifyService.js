const { PrismaClient } = require("@prisma/client");
const fetch = require("node-fetch");

const prisma = new PrismaClient();

/**
 * Check if a specific Spotify app (by appIndex) is rate-limited.
 * SpotifyRateLimit.id is repurposed as appIndex (0, 1, 2, ...).
 * Returns { blocked: boolean, blockedUntil?: number, message?: string }
 */
async function isSpotifyBlocked(appIndex = 0) {
  // Check in-memory cache first — avoids DB round-trip and eliminates the race
  // condition where concurrent requests all read "not blocked" before the first
  // 429 handler has a chance to persist the block.
  const cached = _blockCache.get(appIndex);
  if (cached && cached.blockedUntil > Date.now()) {
    const blockedDate = new Date(cached.blockedUntil);
    const pad = (n) => String(n).padStart(2, "0");
    const formatted = `${pad(blockedDate.getDate())}/${pad(blockedDate.getMonth() + 1)}/${blockedDate.getFullYear()} às ${pad(blockedDate.getHours())}:${pad(blockedDate.getMinutes())}`;
    const serverLabel = `servidor ${appIndex + 1}`;
    return {
      blocked: true,
      appIndex,
      blockedUntil: cached.blockedUntil,
      blockedHeader: cached.header,
      message: `O ${serverLabel} do Spotify está passando por algumas instabilidades então as requisições foram suspensas por hora.\n\nPrevisão de retorno: ${formatted}`,
    };
  }

  try {
    const rateLimitRecord = await prisma.spotifyRateLimit.findUnique({
      where: { id: appIndex },
    });

    if (
      rateLimitRecord &&
      rateLimitRecord.blockedUntil &&
      new Date(rateLimitRecord.blockedUntil).getTime() > Date.now()
    ) {
      const blockedUntil = new Date(rateLimitRecord.blockedUntil).getTime();
      // Re-populate in-memory cache from DB (e.g. after server restart)
      _blockCache.set(appIndex, {
        blockedUntil,
        header: rateLimitRecord.retryAfterHeader,
      });
      const blockedDate = new Date(blockedUntil);
      const pad = (n) => String(n).padStart(2, "0");
      const formatted = `${pad(blockedDate.getDate())}/${pad(
        blockedDate.getMonth() + 1,
      )}/${blockedDate.getFullYear()} às ${pad(blockedDate.getHours())}:${pad(
        blockedDate.getMinutes(),
      )}`;
      const serverLabel = `servidor ${appIndex + 1}`;
      return {
        blocked: true,
        appIndex,
        blockedUntil: blockedUntil,
        blockedHeader: rateLimitRecord.retryAfterHeader,
        message: `O ${serverLabel} do Spotify está passando por algumas instabilidades então as requisições foram suspensas por hora.\n\nPrevisão de retorno: ${formatted}`,
      };
    }
    return { blocked: false, appIndex };
  } catch (e) {
    console.warn(
      `[isSpotifyBlocked] DB read failed (app ${appIndex}):`,
      e.message,
    );
    return { blocked: false, appIndex };
  }
}

/**
 * Set rate limit block for a specific Spotify app (by appIndex).
 * SpotifyRateLimit.id is repurposed as appIndex.
 */
async function setSpotifyBlock(appIndex = 0, blockedUntilMs, retryAfterHeader) {
  // Check if app was previously unblocked (new block, not an extension)
  const prev = _blockCache.get(appIndex);
  const wasBlocked = prev && prev.blockedUntil > Date.now();

  // Update in-memory cache IMMEDIATELY — this is what prevents concurrent requests
  // from racing past the block check before the DB write completes.
  _blockCache.set(appIndex, {
    blockedUntil: blockedUntilMs,
    header: retryAfterHeader || null,
  });

  // Notify admins only when transitioning from unblocked → blocked
  if (!wasBlocked) {
    notifyAdminsRateLimit(appIndex, blockedUntilMs).catch(() => {});
  }

  try {
    await prisma.spotifyRateLimit.upsert({
      where: { id: appIndex },
      create: {
        id: appIndex,
        blockedUntil: new Date(blockedUntilMs),
        retryAfterHeader: retryAfterHeader || null,
        lastUpdated: new Date(),
      },
      update: {
        blockedUntil: new Date(blockedUntilMs),
        retryAfterHeader: retryAfterHeader || null,
        lastUpdated: new Date(),
      },
    });
    console.log(
      `[SpotifyService] Rate limit persisted for app ${appIndex}: blockedUntil=${new Date(
        blockedUntilMs,
      ).toISOString()} retryAfter=${retryAfterHeader}`,
    );
  } catch (e) {
    console.warn(
      `[setSpotifyBlock] DB write failed (app ${appIndex}):`,
      e.message,
    );
  }
}

/**
 * Send a WhatsApp notification to all admin users via the frontend internal API
 * when a new Spotify rate limit block starts.
 */
async function notifyAdminsRateLimit(appIndex, blockedUntilMs) {
  try {
    const admins = await prisma.user.findMany({
      where: { isAdmin: true },
      select: { sender_number: true },
    });
    if (!admins.length) return;

    const blockedDate = new Date(blockedUntilMs);
    const pad = (n) => String(n).padStart(2, "0");
    const formatted = `${pad(blockedDate.getDate())}/${pad(blockedDate.getMonth() + 1)}/${blockedDate.getFullYear()} às ${pad(blockedDate.getHours())}:${pad(blockedDate.getMinutes())}`;
    const message = `⚠️ *[SpotifyMon]* O servidor ${appIndex + 1} do Spotify foi bloqueado por excesso de requisições.\n\nPrevisão de retorno: *${formatted}*`;

    const internalApiUrl =
      process.env.INTERNAL_API_URL || "http://127.0.0.1:3001";
    const secret =
      process.env.POLL_SHARED_SECRET || process.env.INTERNAL_API_SECRET;
    if (!secret) {
      console.warn(
        "[SpotifyService] notifyAdminsRateLimit: POLL_SHARED_SECRET not set, skipping",
      );
      return;
    }

    for (const admin of admins) {
      try {
        await fetch(`${internalApiUrl}/internal/send-message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Secret": secret,
          },
          body: JSON.stringify({ chatId: admin.sender_number, message }),
        });
      } catch (e) {
        // best-effort, individual send failures are non-fatal
      }
    }
  } catch (e) {
    console.warn("[SpotifyService] notifyAdminsRateLimit failed:", e.message);
  }
}

/** In-memory rate-limit cache: appIndex -> { blockedUntil: ms, header: string|null } */
const _blockCache = new Map();

/** In-memory cache: accountId -> appIndex (avoids DB lookup on every spotifyFetch call) */
const _appIndexCache = new Map();

async function getAppIndexForAccount(accountId) {
  if (_appIndexCache.has(accountId)) return _appIndexCache.get(accountId);
  try {
    const acct = await prisma.spotifyAccount.findUnique({
      where: { id: accountId },
      select: { appIndex: true },
    });
    const idx = acct?.appIndex ?? 0;
    _appIndexCache.set(accountId, idx);
    return idx;
  } catch (e) {
    return 0;
  }
}

// Export early to avoid circular dependency issues
module.exports = {
  isSpotifyBlocked,
  setSpotifyBlock,
  getAppIndexForAccount,
  get prisma() {
    return prisma;
  },
  get spotifyFetch() {
    return spotifyFetch;
  },
  get upsertAccountForUser() {
    return upsertAccountForUser;
  },
  get upsertAccountTokens() {
    return upsertAccountTokens;
  },
  get getLatestTokenByAccountId() {
    return getLatestTokenByAccountId;
  },
  get refreshTokenForAccount() {
    return refreshTokenForAccount;
  },
  get getValidAccessTokenForAccount() {
    return getValidAccessTokenForAccount;
  },
  get upsertCurrentPlayback() {
    return upsertCurrentPlayback;
  },
  get createTrackPlayback() {
    return createTrackPlayback;
  },
  get fetchAndPersistUser() {
    return fetchAndPersistUser;
  },
  get selectAppIndexForNewAccount() {
    return selectAppIndexForNewAccount;
  },
};

// Now safe to import modules that depend on spotifyService
const playbackTracker = require("../domains/spotify/services/playbackTrackerService");
const sseHub = require("../lib/sseHub");
const config = require("../config");

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const MAX_USERS_PER_APP = 5;

/**
 * Select the best appIndex for a new SpotifyAccount.
 * Picks the first app that has fewer than MAX_USERS_PER_APP accounts.
 * Throws if all apps are at capacity.
 */
async function selectAppIndexForNewAccount() {
  const apps = config.spotifyApps;
  const counts = await prisma.spotifyAccount.groupBy({
    by: ["appIndex"],
    _count: { id: true },
  });
  const countMap = {};
  for (const row of counts) countMap[row.appIndex] = row._count.id;

  for (const app of apps) {
    const used = countMap[app.index] || 0;
    if (used < MAX_USERS_PER_APP) return app.index;
  }
  throw new Error(
    `All ${apps.length} Spotify apps are at capacity (${MAX_USERS_PER_APP} accounts each). Add a new app to accept more users.`,
  );
}

async function upsertAccountForUser({ userId, appIndex } = {}) {
  // If no userId provided, create a global (bot) account
  if (!userId) {
    const resolvedIndex =
      appIndex != null ? appIndex : await selectAppIndexForNewAccount();
    const account = await prisma.spotifyAccount.create({
      data: { appIndex: resolvedIndex },
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
    if (existing) {
      // Update appIndex if explicitly provided and different from current
      if (appIndex != null && existing.appIndex !== appIndex) {
        return prisma.spotifyAccount.update({
          where: { id: existing.id },
          data: { appIndex },
        });
      }
      return existing;
    }
    const resolvedIndex =
      appIndex != null ? appIndex : await selectAppIndexForNewAccount();
    return prisma.spotifyAccount.create({
      data: { userId: resolvedUser.id, appIndex: resolvedIndex },
    });
  }

  // Could not resolve a local User; create an account WITHOUT foreign key
  const resolvedIndex =
    appIndex != null ? appIndex : await selectAppIndexForNewAccount();
  const account = await prisma.spotifyAccount.create({
    data: { appIndex: resolvedIndex },
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
      e && e.message ? e.message : e,
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

  // Resolve credentials from the account's assigned app
  let clientId = process.env.SPOTIFY_CLIENT_ID_1;
  let clientSecret = process.env.SPOTIFY_CLIENT_SECRET_1;
  try {
    const acct = await prisma.spotifyAccount.findUnique({
      where: { id: accountId },
      select: { appIndex: true },
    });
    if (acct != null) {
      const apps = config.spotifyApps;
      const app = apps[acct.appIndex] || apps[0];
      if (app) {
        clientId = app.clientId;
        clientSecret = app.clientSecret;
      }
    }
  } catch (e) {
    console.warn(
      "[refreshTokenForAccount] could not resolve appIndex:",
      e.message,
    );
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokenRow.refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
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
// Checks per-app block state from DB before making requests.
async function spotifyFetch(accountId, url, options = {}) {
  if (!accountId) throw new Error("accountId is required for spotifyFetch");

  // Resolve which Spotify app this account belongs to, then check its block state
  const appIndex = await getAppIndexForAccount(accountId);
  const blockStatus = await isSpotifyBlocked(appIndex);
  if (blockStatus.blocked) {
    console.warn(
      `[spotifyFetch] app ${appIndex} blocked. blockedUntil=${new Date(
        blockStatus.blockedUntil,
      ).toISOString()} retryHeader=${blockStatus.blockedHeader}`,
    );
    return {
      status: 429,
      ok: false,
      blockedUntil: blockStatus.blockedUntil,
      blockedHeader: blockStatus.blockedHeader,
      appIndex,
      text: async () => blockStatus.message,
      json: async () => ({ error: blockStatus.message }),
    };
  }

  const token = await getValidAccessTokenForAccount(accountId);
  if (!token)
    throw new Error("No access token available for account " + accountId);

  if (!options.headers) options.headers = {};
  options.headers["Authorization"] = `Bearer ${token}`;

  let res = await fetch(url, options);

  // If Spotify replied with 429, parse Retry-After and persist block to DB
  if (res.status === 429) {
    try {
      const ra = res.headers.get("retry-after");
      let ms = 0;
      if (ra) {
        // Normalize and parse various formats ("10", "10000", "10000ms", HTTP-date)
        const raw = ra.trim();
        // If contains 'ms' explicitly, take numeric part as ms
        if (/ms$/i.test(raw)) {
          const digits = raw.replace(/[^0-9]/g, "");
          ms = Number(digits) || 0;
        } else if (/^[0-9]+$/.test(raw)) {
          const numeric = Number(raw);
          // RFC 7231: Retry-After integer value is always in seconds
          ms = numeric * 1000;
        } else {
          // Try parsing as HTTP-date
          const d = Date.parse(raw);
          if (!isNaN(d)) ms = Math.max(0, d - Date.now());
        }
      }
      // Fallback to 30s if header absent or parsing failed
      if (!ms) ms = 30000;

      const blockedUntilMs = Date.now() + ms;
      const minutes = Math.ceil(ms / 60000);

      console.warn(
        `[spotifyFetch] account=${accountId} url=${url} status=429 Retry-After=${ra} computedMs=${ms} blockedUntil=${new Date(
          blockedUntilMs,
        ).toISOString()} -> waiting ${minutes} minutes`,
      );

      // Persist block to DB (per-app)
      await setSpotifyBlock(appIndex, blockedUntilMs, ra);
    } catch (e) {
      console.warn("[spotifyFetch] failed parsing Retry-After", e && e.message);
      // ensure a short block to avoid hammering
      await setSpotifyBlock(appIndex, Date.now() + 30000, null);
    }
  }

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

      // If Spotify replies with a 403 indicating the user isn't registered
      // on the developer dashboard, try to include the push_name of the
      // local user associated to this spotify account for easier debugging.
      let pushNameExtra = "";
      try {
        if (
          res.status === 403 &&
          text &&
          text.toLowerCase().includes("developer.spotify.com/dashboard")
        ) {
          const acct = await prisma.spotifyAccount.findUnique({
            where: { id: accountId },
            include: { user: true },
          });
          const pn = acct?.user?.push_name;
          if (pn) pushNameExtra = ` push_name=${pn.replace(/\s+/g, "_")}`;
        }
      } catch (e) {
        // best-effort lookup; ignore failures
      }

      console.warn(
        `[spotifyFetch] account=${accountId} url=${url} status=${
          res.status
        } body=${text ? text.slice(0, 1000) : "<no-body>"}${pushNameExtra}`,
      );
      // Cache body so callers can still read it after we consumed the stream
      res._bodyText = text || null;
    }
  } catch (e) {
    console.warn("[spotifyFetch] failed to log response body", e && e.message);
  }

  return res;
}

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
 * userSpotifyAPI must implement: getCurrentlyPlaying(userId, accountId) and getConnectedUsers()/getConnectionStatus
 */
async function fetchAndPersistUser({ accountId, userId, userSpotifyAPI }) {
  if (!userSpotifyAPI) throw new Error("userSpotifyAPI is required");

  const result = await userSpotifyAPI.getCurrentlyPlaying(userId, accountId);

  // Resolve accountId if not provided — always use the oldest (primary) account
  let resolvedAccountId = accountId;
  if (!resolvedAccountId) {
    const account = await prisma.spotifyAccount.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    resolvedAccountId = account?.id;
  }

  // if error or not playing, return
  if (!result || result.error || result.playing === false) {
    // no playback detected

    // Delete currentPlayback if it exists (user stopped playing)
    if (resolvedAccountId) {
      try {
        await prisma.currentPlayback.deleteMany({
          where: { accountId: resolvedAccountId },
        });
        try {
          sseHub.sendEvent("playlist_sync", {
            accountId: resolvedAccountId,
            action: "deleted",
          });
        } catch (e) {
          // ignore SSE send errors
        }
      } catch (err) {
        // ignore delete errors
      }
    }

    return { status: "no_music", detail: result };
  }

  // Extract track ID and prepare track data
  const trackId = result.url ? result.url.split("/").pop() : result.id || null;

  if (!trackId || !resolvedAccountId) {
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
    // ignore playback tracker errors
  }

  // Update current playback pointer
  await upsertCurrentPlayback(resolvedAccountId, {
    id: trackId,
    ...result,
  });

  try {
    sseHub.sendEvent("playlist_sync", {
      accountId: resolvedAccountId,
      action: "upserted",
      trackId,
    });
  } catch (e) {
    // ignore SSE send errors
  }

  return { status: "playing", track: result };
}

/**
 * Skip to next track for a user
 * @param {string} userId - User ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function skipTrack() {
  try {
    // Get any user with a connected Spotify Developer account
    // (Since only the Developer account can skip, find the user who has it)
    const user = await prisma.user.findFirst({
      where: {
        spotifyAccounts: {
          some: {}, // Has at least one Spotify account
        },
      },
      include: {
        spotifyAccounts: {
          include: {
            tokens: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    if (!user || user.spotifyAccounts.length === 0) {
      return {
        success: false,
        error: "No Spotify Developer account connected",
      };
    }

    const account = user.spotifyAccounts[0];
    const accountId = account.id;

    // Use spotifyFetch to call skip endpoint
    const res = await spotifyFetch(
      accountId,
      "https://api.spotify.com/v1/me/player/next",
      {
        method: "POST",
      },
    );

    if (res.status === 204 || res.status === 200) {
      return { success: true };
    }

    const errorText = await res.text().catch(() => "Unknown error");
    return { success: false, error: `Spotify API error: ${errorText}` };
  } catch (error) {
    console.error("[spotifyService] skipTrack error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Add track to a playlist
 * @param {string} playlistId - Spotify playlist ID
 * @param {string} trackUri - Spotify track URI (spotify:track:...)
 * @param {string} accountId - Account ID to use for authentication
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function addTrackToPlaylist(playlistId, trackUri, accountId) {
  try {
    if (!trackUri.startsWith("spotify:track:")) {
      trackUri = `spotify:track:${trackUri}`;
    }

    const res = await spotifyFetch(
      accountId,
      `https://api.spotify.com/v1/playlists/${playlistId}/items`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uris: [trackUri],
        }),
      },
    );

    if (res.status === 201 || res.status === 200) {
      const data = await res.json().catch(() => ({}));
      return { success: true, data };
    }

    // Body may already be consumed by spotifyFetch's logging — use cached text first
    const errorText =
      res._bodyText != null
        ? res._bodyText
        : await res.text().catch(() => null);

    // Detect scope issues and return a clearer message
    if (
      res.status === 403 &&
      errorText &&
      errorText.toLowerCase().includes("insufficient client scope")
    ) {
      return {
        success: false,
        error:
          "A conta Spotify do dono da playlist não tem permissão para modificar playlists. Reconecte o Spotify com /conectar.",
        code: "INSUFFICIENT_SCOPE",
      };
    }

    return {
      success: false,
      error: `Spotify API error: ${errorText || `HTTP ${res.status}`}`,
    };
  } catch (error) {
    console.error("[spotifyService] addTrackToPlaylist error:", error);
    return { success: false, error: error.message };
  }
}

module.exports.skipTrack = skipTrack;
module.exports.addTrackToPlaylist = addTrackToPlaylist;

/**
 * Create a new Spotify playlist for a user
 * @param {string} userId - User ID
 * @param {string} name - Playlist name
 * @param {string} description - Playlist description
 * @param {boolean} isPublic - Whether playlist is public
 * @returns {Promise<{success: boolean, playlist?: object, error?: string}>}
 */
async function createSpotifyPlaylist(
  userId,
  name,
  description = "",
  isPublic = false,
) {
  try {
    // Find user's Spotify account
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        spotifyAccounts: {
          include: {
            tokens: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    if (!user || user.spotifyAccounts.length === 0) {
      return { success: false, error: "User has no connected Spotify account" };
    }

    const account = user.spotifyAccounts[0];
    const accountId = account.id;

    // Create playlist
    const createRes = await spotifyFetch(
      accountId,
      "https://api.spotify.com/v1/me/playlists",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description,
          public: isPublic,
        }),
      },
    );

    if (createRes.status === 201 || createRes.status === 200) {
      const playlist = await createRes.json();
      return { success: true, playlist };
    }

    const errorText = await createRes.text().catch(() => "Unknown error");
    return { success: false, error: `Spotify API error: ${errorText}` };
  } catch (error) {
    console.error("[spotifyService] createSpotifyPlaylist error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get Spotify playlist details
 * @param {string} playlistId - Spotify playlist ID
 * @param {string} accountId - Account ID to use for authentication
 * @returns {Promise<{success: boolean, playlist?: object, error?: string}>}
 */
async function getSpotifyPlaylistDetails(playlistId, accountId) {
  try {
    const res = await spotifyFetch(
      accountId,
      `https://api.spotify.com/v1/playlists/${playlistId}`,
      { method: "GET" },
    );

    if (res.ok) {
      const playlist = await res.json();
      return { success: true, playlist };
    }

    const errorText = await res.text().catch(() => "Unknown error");
    return { success: false, error: `Spotify API error: ${errorText}` };
  } catch (error) {
    console.error("[spotifyService] getSpotifyPlaylistDetails error:", error);
    return { success: false, error: error.message };
  }
}

module.exports.createSpotifyPlaylist = createSpotifyPlaylist;
module.exports.getSpotifyPlaylistDetails = getSpotifyPlaylistDetails;

/**
 * Create a Spotify playlist using a specific spotifyAccount (accountId) rather than local userId.
 * This is useful when we only have accountId and want to create a playlist for that account.
 */
async function createSpotifyPlaylistForAccount(
  accountId,
  name,
  description = "",
  isPublic = false,
) {
  try {
    if (!accountId) return { success: false, error: "accountId required" };

    // Create playlist
    const createRes = await spotifyFetch(
      accountId,
      "https://api.spotify.com/v1/me/playlists",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description,
          public: isPublic,
        }),
      },
    );

    if (createRes.status === 201 || createRes.status === 200) {
      const playlist = await createRes.json();
      return { success: true, playlist };
    }

    const errorText = await createRes.text().catch(() => "Unknown error");
    return { success: false, error: `Spotify API error: ${errorText}` };
  } catch (error) {
    console.error(
      "[spotifyService] createSpotifyPlaylistForAccount error:",
      error,
    );
    return { success: false, error: error.message };
  }
}

module.exports.createSpotifyPlaylistForAccount =
  createSpotifyPlaylistForAccount;

/**
 * Add many tracks to a playlist in batch (up to 100 URIs per request).
 */
async function addTracksToPlaylistBatch(playlistId, trackUris = [], accountId) {
  try {
    if (!Array.isArray(trackUris)) trackUris = [trackUris];
    const CHUNK = 100;
    for (let i = 0; i < trackUris.length; i += CHUNK) {
      const chunk = trackUris
        .slice(i, i + CHUNK)
        .map((u) => (u.startsWith("spotify:") ? u : `spotify:track:${u}`));
      const res = await spotifyFetch(
        accountId,
        `https://api.spotify.com/v1/playlists/${playlistId}/items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uris: chunk }),
        },
      );
      if (!(res.status === 201 || res.status === 200)) {
        const t = await res.text().catch(() => null);
        return {
          success: false,
          error: `Spotify API error: ${t || res.status}`,
        };
      }
      // small delay between batches
      await new Promise((r) => setTimeout(r, 150));
    }
    return { success: true };
  } catch (e) {
    console.error(
      "[spotifyService] addTracksToPlaylistBatch error:",
      e && e.message,
    );
    return { success: false, error: e.message };
  }
}

module.exports.addTracksToPlaylistBatch = addTracksToPlaylistBatch;
