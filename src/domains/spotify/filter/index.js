/**
 * Filter out candidate tracks that already exist in a playlist set
 * candidates: array of track objects (with `id` and `uri` and `is_local`)
 * playlistSet: object with `ids` (Set) and `uris` (Set)
 */
function filterExistingTracks(
  candidates = [],
  playlistSet = { ids: new Set(), uris: new Set() },
) {
  const { ids, uris } = playlistSet;
  const results = [];
  for (const t of candidates) {
    if (!t) continue;
    if (t.is_local) continue; // skip local tracks
    const id = t.id || null;
    const uri = t.uri || null;
    if (id && ids && ids.has(id)) continue;
    if (uri && uris && uris.has(uri)) continue;
    results.push(t);
  }
  return results;
}

module.exports = { filterExistingTracks };
