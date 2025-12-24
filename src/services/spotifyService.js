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
  if (
    latest.expiresAt &&
    new Date(latest.expiresAt) > new Date(Date.now() + 60 * 1000)
  ) {
    return latest.accessToken;
  }
  // expired or near-expiry: refresh
  const refreshed = await refreshTokenForAccount(accountId);
  return refreshed.token.accessToken;
}

module.exports = {
  prisma,
  upsertAccountForUser,
  upsertAccountTokens,
  getLatestTokenByAccountId,
  refreshTokenForAccount,
  getValidAccessTokenForAccount,
};
