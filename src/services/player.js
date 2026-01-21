const { spotifyFetch } = require("../services/spotifyService");
const { withRetry } = require("../utils/retry");

async function queueTrack(accountId, trackUri, deviceId = null) {
  if (!accountId) throw new Error("accountId required");
  if (!trackUri) throw new Error("trackUri required");

  const urlBase = `https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(trackUri)}`;
  const url = deviceId
    ? `${urlBase}&device_id=${encodeURIComponent(deviceId)}`
    : urlBase;

  const res = await withRetry(
    () => spotifyFetch(accountId, url, { method: "POST" }),
    { retries: 2, minDelay: 300 },
  );
  if (!res) throw new Error("No response from spotifyFetch");
  if (res.status === 204 || res.status === 200) return { success: true };
  const text = await res.text().catch(() => null);
  return { success: false, error: text || `HTTP ${res.status}` };
}

async function queueTracksSequential(
  accountId,
  trackUris = [],
  deviceId = null,
) {
  const results = [];
  for (const uri of trackUris) {
    try {
      const r = await queueTrack(accountId, uri, deviceId);
      results.push({ uri, result: r });
      // Small delay to avoid hitting rate limits
      await new Promise((res) => setTimeout(res, 150));
    } catch (err) {
      results.push({ uri, result: { success: false, error: err.message } });
    }
  }
  return results;
}

async function startPlayback(
  accountId,
  uris = [],
  deviceId = null,
  contextUri = null,
) {
  if (!accountId) throw new Error("accountId required");
  if (!contextUri && (!Array.isArray(uris) || uris.length === 0))
    throw new Error("uris or contextUri required");

  const url = deviceId
    ? `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`
    : `https://api.spotify.com/v1/me/player/play`;

  const body = contextUri ? { context_uri: contextUri } : { uris };

  const res = await withRetry(
    () =>
      spotifyFetch(accountId, url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    { retries: 2, minDelay: 300 },
  );

  if (!res) throw new Error("No response from spotifyFetch");
  if (res.status === 204 || res.status === 200) return { success: true };
  const text = await res.text().catch(() => null);
  return { success: false, error: text || `HTTP ${res.status}` };
}

module.exports = { queueTrack, queueTracksSequential, startPlayback };
