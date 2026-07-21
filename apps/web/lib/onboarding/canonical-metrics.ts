/**
 * Canonical artist metrics contract for onboarding surfaces.
 *
 * Profile rail, tool artifacts, and chat state must all read follower counts
 * through `normalizeArtistMetrics` so the UI never displays two contradictory
 * Spotify follower numbers (or confuses monthly listeners with followers).
 */

export type ArtistMetricsSource =
  | 'spotify_api'
  | 'spotify_search'
  | 'tool_output'
  | 'unknown';

export interface CanonicalArtistMetrics {
  /** Spotify follower total. Never equal to monthlyListeners. */
  readonly spotifyFollowers: number | null;
  /** Optional monthly listeners when a source provides them separately. */
  readonly monthlyListeners: number | null;
  readonly source: ArtistMetricsSource;
  /** ISO-8601 timestamp of when this snapshot was produced. */
  readonly updatedAt: string;
}

/**
 * Loose input shapes we accept from Spotify API, search results, tool output,
 * or partial rehydration payloads.
 */
export interface ArtistMetricsInput {
  readonly followers?: number | null;
  readonly followerCount?: number | null;
  readonly followersTotal?: number | null;
  readonly spotifyFollowers?: number | null;
  /** Nested Spotify API shape: `{ total: number }`. */
  readonly followersObject?: { readonly total?: number | null } | null;
  readonly monthlyListeners?: number | null;
  readonly monthly_listeners?: number | null;
  readonly source?: ArtistMetricsSource | null;
  readonly updatedAt?: string | Date | null;
}

export interface NormalizeArtistMetricsOptions {
  readonly source?: ArtistMetricsSource;
  readonly updatedAt?: string | Date | null;
}

function toNonNegativeInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0) return null;
  return Math.trunc(value);
}

function toIsoTimestamp(value: string | Date | null | undefined): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

/**
 * Collapse heterogeneous artist metric fields into one snapshot.
 *
 * Precedence for Spotify followers (first non-null wins):
 *   spotifyFollowers → followers → followerCount → followersTotal → followersObject.total
 *
 * Monthly listeners are read only from monthlyListeners / monthly_listeners —
 * never from the followers fields — so UI cannot mix the two series.
 */
export function normalizeArtistMetrics(
  input: ArtistMetricsInput | null | undefined,
  options: NormalizeArtistMetricsOptions = {}
): CanonicalArtistMetrics {
  const source =
    options.source ??
    (input?.source && isArtistMetricsSource(input.source)
      ? input.source
      : 'unknown');

  const spotifyFollowers =
    toNonNegativeInt(input?.spotifyFollowers) ??
    toNonNegativeInt(input?.followers) ??
    toNonNegativeInt(input?.followerCount) ??
    toNonNegativeInt(input?.followersTotal) ??
    toNonNegativeInt(input?.followersObject?.total);

  const monthlyListeners =
    toNonNegativeInt(input?.monthlyListeners) ??
    toNonNegativeInt(input?.monthly_listeners);

  return {
    spotifyFollowers,
    monthlyListeners,
    source,
    updatedAt: toIsoTimestamp(options.updatedAt ?? input?.updatedAt),
  };
}

function isArtistMetricsSource(value: string): value is ArtistMetricsSource {
  return (
    value === 'spotify_api' ||
    value === 'spotify_search' ||
    value === 'tool_output' ||
    value === 'unknown'
  );
}

/**
 * Prefer a confirmed / tool-output snapshot over a search-result snapshot so
 * profile rail and chat never disagree after confirmSpotifyArtist runs.
 */
export function pickPreferredArtistMetrics(
  primary: CanonicalArtistMetrics | null | undefined,
  fallback: CanonicalArtistMetrics | null | undefined
): CanonicalArtistMetrics | null {
  if (primary?.spotifyFollowers != null) return primary;
  if (fallback?.spotifyFollowers != null) return fallback;
  return primary ?? fallback ?? null;
}

/** Display helper: always the canonical follower field, never monthly listeners. */
export function getDisplaySpotifyFollowers(
  metrics: CanonicalArtistMetrics | null | undefined
): number | null {
  return metrics?.spotifyFollowers ?? null;
}
