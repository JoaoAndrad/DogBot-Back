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
  if (!userId) {
    // create a bot/global account
    const account = await prisma.spotifyAccount.create({
      data: { accountType, clientId, scope },
    });
    return account;
  }
  const existing = await prisma.spotifyAccount.findFirst({ where: { userId } });
  if (existing) return existing;
  return prisma.spotifyAccount.create({
    data: { userId, accountType, clientId, scope },
  });
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
