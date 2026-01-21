const { spotifyFetch } = require("../../services/spotifyService");

/**
 * Fetch all track IDs (and URIs) from a playlist, paginating as needed.
 * Returns an object with two properties: `ids` (Set of track ids) and `uris` (Set of track uris).
 * Skips local tracks (track.is_local) and null ids.
 */
async function fetchPlaylistTrackIds(accountId, playlistId) {
  if (!accountId) throw new Error("accountId required");
  if (!playlistId) throw new Error("playlistId required");

  const limit = 50;
  let offset = 0;
  const ids = new Set();
  const uris = new Set();

  while (true) {
    const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`;
    const res = await spotifyFetch(accountId, url, { method: "GET" });
    if (!res || !res.ok) {
      // If playlist not accessible, return empty sets gracefully
      try {
        const text = await (res && res.text
          ? res.text()
          : Promise.resolve(null));
        console.warn(
          "fetchPlaylistTrackIds: non-ok response",
          res && res.status,
          text && text.slice ? text.slice(0, 200) : text,
        );
      } catch (e) {
        // ignore
      }
      return { ids, uris };
    }

    const data = await res.json();
    if (!data || !Array.isArray(data.items)) break;

    for (const item of data.items) {
      const track = item.track || item;
      if (!track) continue;
      if (track.is_local) continue; // skip local tracks
      if (track.id) ids.add(track.id);
      if (track.uri) uris.add(track.uri);
    }

    if (!data.next || data.items.length < limit) break;
    offset += limit;
  }

  return { ids, uris };
}

module.exports = { fetchPlaylistTrackIds };
