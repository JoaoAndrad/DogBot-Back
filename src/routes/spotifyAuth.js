const express = require("express");

const router = express.Router();

const config = require("../config");

const {
  upsertAccountTokens,
  upsertAccountForUser,
  prisma,
  selectAppIndexForNewAccount,
} = require("../services/spotifyService");
const userRepo = require("../domains/users/repo/userRepo");
const { randomUUID } = require("crypto");

function base64Creds(clientId, clientSecret) {
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

// Simple helper to POST form-encoded to Spotify token endpoint
async function postTokenForm(bodyObj, clientId, clientSecret) {
  const apps = config.spotifyApps;
  const id = clientId || apps[0].clientId;
  const secret = clientSecret || apps[0].clientSecret;
  const body = new URLSearchParams(bodyObj).toString();
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${base64Creds(id, secret)}`,
    },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json;
}

// Redirect user to Spotify Authorization page
router.get("/login", (req, res) => {
  const apps = config.spotifyApps;
  const app = apps[0];
  if (!app || !app.clientId || !app.redirectUri) {
    return res.status(500).json({ error: "Spotify client not configured" });
  }
  const scopes = (
    req.query.scopes || "user-read-private user-read-email"
  ).trim();
  const params = new URLSearchParams({
    client_id: app.clientId,
    response_type: "code",
    redirect_uri: app.redirectUri,
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
  const apps = config.spotifyApps;
  if (!apps.length || !apps[0].clientId || !apps[0].redirectUri) {
    return res.status(500).json({ error: "Spotify client not configured" });
  }

  try {
    // If this userId already has a SpotifyAccount, reuse its appIndex (re-auth)
    // Otherwise auto-assign the best app for a new user
    let appIndex;
    try {
      if (userId) {
        // Resolve UUID or WhatsApp identifier to find existing account
        let resolvedId = userId;
        const isUUID =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            userId,
          );
        if (!isUUID) {
          let user = await userRepo.findByIdentifierExact(userId);
          if (!user) {
            user = await userRepo.findByBaseNumber(
              userRepo.extractBaseNumber(userId),
            );
          }
          if (user) resolvedId = user.id;
        }
        const existingAccount = await prisma.spotifyAccount.findFirst({
          where: { userId: resolvedId },
          select: { appIndex: true },
        });
        if (existingAccount != null) {
          appIndex = existingAccount.appIndex;
          console.log(
            `[SpotifyAuth] Re-auth: reusing appIndex=${appIndex} for userId=${resolvedId}`,
          );
        }
      }
      if (appIndex == null) {
        appIndex = await selectAppIndexForNewAccount();
      }
    } catch (capErr) {
      return res.status(503).json({ error: capErr.message });
    }
    const app = apps[appIndex];

    const state = randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // persist auth session for later verification in callback
    if (!prisma || !prisma.spotifyAuthSession) {
      const msg =
        "Prisma client missing model `spotifyAuthSession`. Run `npx prisma generate` and restart the server";
      console.log("/spotify/start error:", msg);
      return res.status(500).json({ error: msg });
    }

    await prisma.spotifyAuthSession.create({
      data: {
        state,
        userId,
        redirectAfter,
        expiresAt,
        appIndex,
        metadata: { initiatedBy: "frontend" },
      },
    });

    const scopeStr = (
      scopes ||
      "user-read-private user-read-email user-read-playback-state user-read-currently-playing user-modify-playback-state"
    ).trim();
    const params = new URLSearchParams({
      client_id: app.clientId,
      response_type: "code",
      redirect_uri: app.redirectUri,
      scope: scopeStr,
      state,
      show_dialog: show_dialog ? "true" : "false",
    });

    const url = `https://accounts.spotify.com/authorize?${params.toString()}`;
    return res.json({ auth_url: url, state, appIndex });
  } catch (err) {
    console.log("/spotify/auth/start error", err);
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
    // If state present, try to resolve session and pick the correct app credentials
    const state = req.query.state || null;
    let session = null;
    let appIndex = 0;
    try {
      if (state) {
        session = await prisma.spotifyAuthSession.findUnique({
          where: { state },
        });
        if (session) {
          if (session.userId && !userId) userId = session.userId;
          if (session.appIndex != null) appIndex = session.appIndex;
        }
      }
    } catch (sessErr) {
      console.warn("failed to lookup spotify auth session", sessErr);
    }

    const apps = config.spotifyApps;
    const app = apps[appIndex] || apps[0];

    const data = await postTokenForm(
      {
        grant_type: "authorization_code",
        code,
        redirect_uri: app.redirectUri,
      },
      app.clientId,
      app.clientSecret,
    );

    // Persist tokens in DB
    try {
      // Log the received userId for debugging
      console.log(
        `[SpotifyAuth] Received userId from callback: ${userId || "(null)"}`,
      );

      // Resolve userId: if it's a WhatsApp identifier, find the User.id UUID
      let resolvedUserId = userId;
      if (userId) {
        // Check if it's already a UUID (36 chars with dashes)
        const isUUID =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            userId,
          );

        if (!isUUID) {
          // It's a WhatsApp identifier, resolve to User.id
          console.log(
            `[SpotifyAuth] Attempting to resolve WhatsApp identifier: ${userId}`,
          );
          try {
            let user = await userRepo.findByIdentifierExact(userId);
            if (!user) {
              const baseNumber = userRepo.extractBaseNumber(userId);
              console.log(`[SpotifyAuth] Trying by base number: ${baseNumber}`);
              user = await userRepo.findByBaseNumber(baseNumber);
            }
            if (user) {
              resolvedUserId = user.id;
              console.log(
                `[SpotifyAuth] ✅ Resolved identifier ${userId} → User.id ${resolvedUserId}`,
              );
              console.log(
                `[SpotifyAuth] User info: ${
                  user.push_name || user.display_name || "(sem nome)"
                } (${user.sender_number || "sem número"})`,
              );
            } else {
              console.warn(
                `[SpotifyAuth] ⚠️ Could not resolve identifier ${userId} to User - account will be created without userId`,
              );
              console.warn(
                `[SpotifyAuth] Hint: If this is a @lid, ensure frontend uses getContact() to get the real @c.us number`,
              );
              resolvedUserId = null;
            }
          } catch (resolveErr) {
            console.error(
              `[SpotifyAuth] Error resolving identifier ${userId}:`,
              resolveErr,
            );
            resolvedUserId = null;
          }
        }
      }

      // create or find account
      const account = resolvedUserId
        ? await upsertAccountForUser({
            userId: resolvedUserId,
            accountType: "user",
            appIndex,
          })
        : await upsertAccountForUser({ accountType: "bot", appIndex });

      console.log(
        `[SpotifyAuth] ✅ Spotify account ${
          account.isNew ? "created" : "found"
        }: ${account.id}`,
      );

      // Get user details for logging
      if (resolvedUserId) {
        try {
          const user = await prisma.user.findUnique({
            where: { id: resolvedUserId },
            select: {
              id: true,
              push_name: true,
              display_name: true,
              sender_number: true,
            },
          });
          if (user) {
            console.log(
              `[SpotifyAuth] 🎵 Nova conta Spotify atribuída ao usuário: ${
                user.push_name || user.display_name || "(sem nome)"
              } (ID: ${user.id})`,
            );
            console.log(
              `[SpotifyAuth] 📞 Telefone: ${user.sender_number || "n/a"}`,
            );
          }
        } catch (logErr) {
          console.log(
            "[SpotifyAuth] Could not fetch user details for logging:",
            logErr.message,
          );
        }
      } else {
        console.log(
          `[SpotifyAuth] ⚠️ Conta Spotify criada sem usuário associado (bot account)`,
        );
      }

      const result = await upsertAccountTokens({
        accountId: account.id,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        scope: data.scope,
      });

      console.log(
        `[SpotifyAuth] 🔑 Tokens salvos para conta ${account.id} (expires in ${data.expires_in}s)`,
      );
      console.log(
        `[SpotifyAuth] 🎯 Scopes concedidos: ${data.scope || "none"}`,
      );

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
      // This endpoint is always reached via a browser redirect from Spotify.
      // Return a friendly HTML page instead of raw JSON.
      const successHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Spotify Conectado</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #121212;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card {
      background: #1e1e1e;
      border-radius: 16px;
      padding: 48px 40px;
      max-width: 420px;
      width: 100%;
      text-align: center;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    .icon {
      width: 72px;
      height: 72px;
      background: #1db954;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
    }
    .icon svg { width: 38px; height: 38px; fill: #fff; }
    h1 {
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 12px;
      color: #fff;
    }
    p {
      font-size: 1rem;
      color: #b3b3b3;
      line-height: 1.6;
    }
    .highlight { color: #1db954; font-weight: 600; }
    .footer {
      margin-top: 32px;
      font-size: 0.8rem;
      color: #535353;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
      </svg>
    </div>
    <h1>Conta Spotify conectada!</h1>
    <p>Sua conta foi autorizada com sucesso.<br>
    Você já pode <span class="highlight">retornar ao WhatsApp</span> e continuar usando o bot.</p>
    <div class="footer">DogBot &bull; Pode fechar esta aba.</div>
  </div>
</body>
</html>`;
      return res.status(200).type("text/html").send(successHtml);
    } catch (dbErr) {
      console.log("Failed to persist Spotify tokens:", dbErr);
      // still return tokens to caller but warn
      return res.json({
        warning: "Token exchange succeeded but persistence failed",
        data,
      });
    }
  } catch (e) {
    console.log("spotify callback error", e.message || e);
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
          accountId,
        );
      return res.json({
        message: "refreshed",
        accountId,
        tokenId: result.token.id,
        raw: result,
      });
    } catch (err) {
      console.log("spotify refresh error", err.message || err);
      return res.status(500).json({
        error: "Failed to refresh token for account",
        details: String(err),
      });
    }
  }

  if (!refresh_token)
    return res.status(400).json({ error: "Missing refresh_token" });
  try {
    const apps = config.spotifyApps;
    const app = apps[0];
    const data = await postTokenForm(
      { grant_type: "refresh_token", refresh_token },
      app.clientId,
      app.clientSecret,
    );
    return res.json(data);
  } catch (e) {
    console.log("spotify refresh error", e.message || e);
    return res
      .status(500)
      .json({ error: "Failed to refresh token", details: String(e) });
  }
});

module.exports = router;
