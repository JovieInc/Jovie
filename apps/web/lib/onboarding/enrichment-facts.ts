import type { CanonicalArtistMetrics } from '@/lib/onboarding/canonical-metrics';
import {
  type EnrichedFact,
  type EnrichmentProjectionOptions,
  enrichedFactId,
  projectPublicEnrichedFacts,
} from '@/lib/profile-facts/enrichment';
import { resolveSpotifyArtistIdentity } from '@/lib/spotify/artist-id';

/** Exact provider identity, not a claimed profile or a guessed display-name match. */
export function spotifyEnrichmentSubjectId(
  spotifyArtistId: string
): string | null {
  const identity = resolveSpotifyArtistIdentity([spotifyArtistId]);
  return identity.status === 'resolved'
    ? `spotify:artist:${identity.spotifyArtistId}`
    : null;
}

/**
 * Adapt the existing canonical snapshot; never equate listeners with followers,
 * manufacture missing metrics, refresh an old retrieval date or promote indirect
 * tool output into direct Spotify verification.
 */
export function buildSpotifyEnrichedFacts(
  input: {
    readonly spotifyArtistId: string;
    readonly returnedArtistId: string;
    readonly displayName: string | null;
    readonly metrics: CanonicalArtistMetrics | null;
  },
  options: EnrichmentProjectionOptions = {}
): readonly EnrichedFact[] {
  const identity = resolveSpotifyArtistIdentity([
    input.spotifyArtistId,
    input.returnedArtistId,
  ]);
  const subjectId = spotifyEnrichmentSubjectId(input.spotifyArtistId);
  if (
    !subjectId ||
    identity.status !== 'resolved' ||
    input.spotifyArtistId !== input.returnedArtistId
  ) {
    options.onFailure?.('conflicting_identity');
    return [];
  }
  const metrics = input.metrics;
  const count = metrics?.spotifyFollowers;
  const value =
    typeof count === 'number' && Number.isInteger(count) && count >= 0
      ? { type: 'number' as const, value: count }
      : null;
  const direct =
    metrics?.source === 'spotify_api' || metrics?.source === 'spotify_search';
  const originUrl = `https://open.spotify.com/artist/${identity.spotifyArtistId}`;
  const fact: EnrichedFact = {
    schemaVersion: 1,
    id: enrichedFactId(subjectId, 'spotify.followers', 'followers'),
    subject: {
      id: subjectId,
      type: 'person',
      displayName: input.displayName,
      roles: ['musician'],
      identity: 'resolved',
    },
    predicate: 'spotify.followers',
    value,
    unit: 'followers',
    status: value ? 'resolved' : 'unknown',
    verification: metrics?.source === 'spotify_api' ? 'verified' : 'unverified',
    permission: 'public',
    confidence: null,
    sourceRefs: [
      {
        id: `${subjectId}:${metrics?.source ?? 'unknown'}:followers:${metrics?.updatedAt ?? 'unknown'}`,
        subjectId,
        kind: direct ? 'direct' : 'enrichment',
        provider: direct
          ? 'spotify'
          : metrics?.source === 'tool_output'
            ? 'jovie_tool_output'
            : null,
        originUrl,
        url: originUrl,
        fetchedAt:
          metrics && metrics.source !== 'unknown' ? metrics.updatedAt : null,
        // A retrieval date does not establish the metric's measurement window.
        asOf: null,
        status: value ? 'available' : 'missing',
        freshness: 'unknown',
        verification:
          metrics?.source === 'spotify_api' ? 'verified' : 'unverified',
        confidence: null,
      },
    ],
  };
  return projectPublicEnrichedFacts([fact], subjectId, options);
}
