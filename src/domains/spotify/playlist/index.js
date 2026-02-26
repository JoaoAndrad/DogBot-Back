const path = require("path");
const { spotifyFetch } = require(
  path.join(__dirname, "..", "..", "..", "services", "spotifyService"),
);

/**
 * Fetch playlist tracks and return sets for ids/uris and an array of track objects
 * @param {string} accountId - spotifyAccount id used by spotifyFetch
 * @param {string} playlistId - spotify playlist id
 * @returns {Promise<{ids:Set,uris:Set,tracks:Array}>}
 */
async function fetchPlaylistTrackIds(accountId, playlistId) {
  if (!playlistId) throw new Error("playlistId required");
  if (!accountId) throw new Error("accountId required");

  const ids = new Set();
  const uris = new Set();
  const tracks = [];

  let offset = 0;
  const limit = 100;

  while (true) {
    const url = `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=${limit}&offset=${offset}`;
    const res = await spotifyFetch(accountId, url, { method: "GET" });
    if (!res || !res.ok) {
      const text = await (
        res && res.text ? res.text() : Promise.resolve(null)
      ).catch(() => null);
      throw new Error(
        `Failed to fetch playlist tracks: ${res && res.status} ${text || ""}`,
      );
    }
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    for (const it of items) {
      const t = it && it.item ? it.item : null;
      if (!t) continue;
      const is_local = !!t.is_local;
      const id = t.id || null;
      const uri = t.uri || null;
      const artists = Array.isArray(t.artists)
        ? t.artists.map((a) => a.name)
        : [];
      const name = t.name || null;

      if (id) ids.add(id);
      if (uri) uris.add(uri);

      tracks.push({ id, uri, name, artists, is_local });
    }

    if (!data.next || items.length < limit) break;
    offset += limit;
  }

  return { ids, uris, tracks };
}

module.exports = { fetchPlaylistTrackIds };
