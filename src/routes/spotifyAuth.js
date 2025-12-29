const express = require("express");

const router = express.Router();

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;

const {
  upsertAccountTokens,
  upsertAccountForUser,
  prisma,
} = require("../services/spotifyService");
const { randomUUID } = require("crypto");

function base64ClientCreds() {
  return Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString(
    "base64"
  );
}

// Simple helper to POST form-encoded to Spotify token endpoint
async function postTokenForm(bodyObj) {
  const body = new URLSearchParams(bodyObj).toString();
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${base64ClientCreds()}`,
    },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json;
}

// Redirect user to Spotify Authorization page
router.get("/login", (req, res) => {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_REDIRECT_URI) {
    return res.status(500).json({ error: "Spotify client not configured" });
  }
  const scopes = (
    req.query.scopes || "user-read-private user-read-email"
  ).trim();
  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: SPOTIFY_REDIRECT_URI,
    scope: scopes,
  });
  const url = `https://accounts.spotify.com/authorize?${params.toString()}`;
  res.redirect(url);
});

// Start OAuth flow: create a short-lived auth session and return auth URL
router.post("/start", async (req, res) => {
  const {
    userId = null,
    scopes = null,
    redirectAfter = null,
    show_dialog = false,
  } = req.body || {};
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_REDIRECT_URI) {
    return res.status(500).json({ error: "Spotify client not configured" });
  }

  try {
    const state = randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // persist auth session for later verification in callback
    if (!prisma || !prisma.spotifyAuthSession) {
      const msg =
        "Prisma client missing model `spotifyAuthSession`. Run `npx prisma generate` and restart the server";
      console.error("/spotify/start error:", msg);
      return res.status(500).json({ error: msg });
    }

    await prisma.spotifyAuthSession.create({
      data: {
        state,
        userId,
        redirectAfter,
        expiresAt,
        metadata: { initiatedBy: "frontend" },
      },
    });

    const scopeStr = (
      scopes ||
      "user-read-private user-read-email user-read-playback-state user-read-currently-playing"
    ).trim();
    const params = new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      response_type: "code",
      redirect_uri: SPOTIFY_REDIRECT_URI,
      scope: scopeStr,
      state,
      show_dialog: show_dialog ? "true" : "false",
    });

    const url = `https://accounts.spotify.com/authorize?${params.toString()}`;
    return res.json({ auth_url: url, state });
  } catch (err) {
    console.error("/spotify/auth/start error", err);
    return res
      .status(500)
      .json({ error: "Failed to start auth", details: String(err) });
  }
});

// Callback: exchange code for tokens and return JSON (no DB persistence here)
router.get("/callback", async (req, res) => {
  const code = req.query.code;
  let userId = req.query.user_id || null; // optional: link token to a user
  if (!code) return res.status(400).json({ error: "Missing code" });
  try {
    const data = await postTokenForm({
      grant_type: "authorization_code",
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
    });

    // If state present, try to resolve session and prefer its userId
    const state = req.query.state || null;
    let session = null;
    try {
      if (state) {
        session = await prisma.spotifyAuthSession.findUnique({
          where: { state },
        });
        if (session && session.userId && !userId) {
          // prefer session's userId if callback did not include one
          // eslint-disable-next-line no-param-reassign
          userId = session.userId;
        }
      }
    } catch (sessErr) {
      console.warn("failed to lookup spotify auth session", sessErr);
    }

    // Persist tokens in DB
    try {
      // create or find account
      const account = userId
        ? await upsertAccountForUser({ userId, accountType: "user" })
        : await upsertAccountForUser({ accountType: "bot" });
      const result = await upsertAccountTokens({
        accountId: account.id,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        scope: data.scope,
      });

      // mark session used and attach accountId if we have a session
      try {
        if (session) {
          await prisma.spotifyAuthSession.update({
            where: { id: session.id },
            data: { used: true, accountId: account.id },
          });
        }
      } catch (uErr) {
        console.warn("failed to update spotify auth session", uErr);
      }
      return res.json({
        message: "Tokens saved",
        account: account.id,
        tokenId: result.token.id,
        raw: data,
      });
    } catch (dbErr) {
      console.error("Failed to persist Spotify tokens:", dbErr);
      // still return tokens to caller but warn
      return res.json({
        warning: "Token exchange succeeded but persistence failed",
        data,
      });
    }
  } catch (e) {
    console.error("spotify callback error", e.message || e);
    return res
      .status(500)
      .json({ error: "Failed to exchange code", details: String(e) });
  }
});

// Refresh token: accepts ?refresh_token= or uses env SPOTIFY_REFRESH_TOKEN
router.get("/refresh", async (req, res) => {
  const accountId = req.query.account_id || null;
  const refresh_token =
    req.query.refresh_token || process.env.SPOTIFY_REFRESH_TOKEN;
  if (accountId) {
    try {
      const result =
        await require("../services/spotifyService").refreshTokenForAccount(
          accountId
        );
      return res.json({
        message: "refreshed",
        accountId,
        tokenId: result.token.id,
        raw: result,
      });
    } catch (err) {
      console.error("spotify refresh error", err.message || err);
      return res.status(500).json({
        error: "Failed to refresh token for account",
        details: String(err),
      });
    }
  }

  if (!refresh_token)
    return res.status(400).json({ error: "Missing refresh_token" });
  try {
    const data = await postTokenForm({
      grant_type: "refresh_token",
      refresh_token,
    });
    return res.json(data);
  } catch (e) {
    console.error("spotify refresh error", e.message || e);
    return res
      .status(500)
      .json({ error: "Failed to refresh token", details: String(e) });
  }
});

module.exports = router;
