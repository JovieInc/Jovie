/**
 * Spotify Developer Policy III.13 forbids deriving metrics from Spotify
 * content (popularity, streams, listener counts, audio features, and the
 * like). Catalog mismatch rows stay on ISRC presence only.
 */

const FORBIDDEN_DERIVED_METRIC_KEYS = new Set([
  'popularity',
  'followers',
  'followercount',
  'monthlylisteners',
  'streams',
  'streamcount',
  'playcount',
  'audiofeatures',
  'danceability',
  'energy',
  'valence',
  'tempo',
  'listenercount',
]);

export const SPOTIFY_CATALOG_POLICY =
  'Catalog mismatches are ISRC presence only (missing from a DSP, or on a DSP and not in the catalog). This section does not report popularity, follower counts, stream counts, listener counts, or audio features derived from Spotify content (Spotify Developer Policy III.13).';

export function findDerivedSpotifyMetricKeys(
  value: unknown,
  path = '$'
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findDerivedSpotifyMetricKeys(item, `${path}[${index}]`)
    );
  }
  if (!value || typeof value !== 'object') return [];

  const hits: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    if (FORBIDDEN_DERIVED_METRIC_KEYS.has(key.toLowerCase())) {
      hits.push(nextPath);
    }
    hits.push(...findDerivedSpotifyMetricKeys(child, nextPath));
  }
  return hits;
}
