const express = require("express");

const router = express.Router();

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;

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

// Callback: exchange code for tokens and return JSON (no DB persistence here)
router.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).json({ error: "Missing code" });
  try {
    const data = await postTokenForm({
      grant_type: "authorization_code",
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
    });
    // return token info to caller (in production persist to DB)
    return res.json(data);
  } catch (e) {
    console.error("spotify callback error", e.message || e);
    return res
      .status(500)
      .json({ error: "Failed to exchange code", details: String(e) });
  }
});

// Refresh token: accepts ?refresh_token= or uses env SPOTIFY_REFRESH_TOKEN
router.get("/refresh", async (req, res) => {
  const refresh_token =
    req.query.refresh_token || process.env.SPOTIFY_REFRESH_TOKEN;
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
