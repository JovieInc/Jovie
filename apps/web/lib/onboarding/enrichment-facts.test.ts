import { describe, expect, it, vi } from 'vitest';
import { normalizeArtistMetrics } from './canonical-metrics';
import {
  buildSpotifyEnrichedFacts,
  spotifyEnrichmentSubjectId,
} from './enrichment-facts';

const id = '1Cs0zKBU1kc0i8ypK3B9ai';
const now = '2026-10-08T20:00:00.000Z';
// Existing onboarding API fixture's exact follower total, not a sample UI metric.
const metrics = normalizeArtistMetrics(
  { spotifyFollowers: 28_000_000 },
  { source: 'spotify_api', updatedAt: now }
);
const input = {
  spotifyArtistId: id,
  returnedArtistId: id,
  displayName: 'David Guetta',
  metrics,
};

describe('Spotify evidence adapter', () => {
  it('exposes exact API fixture count, origin and retrieval independently of ownership', () => {
    const [fact] = buildSpotifyEnrichedFacts(input, { now });
    expect(fact).toMatchObject({
      subject: { id: `spotify:artist:${id}`, roles: ['musician'] },
      predicate: 'spotify.followers',
      value: { type: 'number', value: 28_000_000 },
      unit: 'followers',
      verification: 'verified',
    });
    expect(fact.sourceRefs[0]).toMatchObject({
      kind: 'direct',
      provider: 'spotify',
      originUrl: `https://open.spotify.com/artist/${id}`,
      fetchedAt: now,
      asOf: null,
    });
    expect(JSON.parse(JSON.stringify(fact))).toEqual(fact);
  });

  it('does not treat indirect tool output as direct Spotify certification', () => {
    const indirect = normalizeArtistMetrics(
      { followers: 28_000_000 },
      { source: 'tool_output', updatedAt: now }
    );
    const [fact] = buildSpotifyEnrichedFacts(
      { ...input, metrics: indirect },
      { now }
    );
    expect(fact).toMatchObject({
      verification: 'unverified',
      value: { type: 'number', value: 28_000_000 },
    });
    expect(fact.sourceRefs[0]).toMatchObject({
      kind: 'enrichment',
      provider: 'jovie_tool_output',
      verification: 'unverified',
    });
  });

  it('does not substitute listeners, invent missing followers, or refresh legacy unknown provenance', () => {
    const listeners = normalizeArtistMetrics(
      { monthlyListeners: 1234 },
      { source: 'spotify_api', updatedAt: now }
    );
    expect(
      buildSpotifyEnrichedFacts({ ...input, metrics: listeners }, { now })[0]
    ).toMatchObject({ status: 'unknown', value: null });
    const unknown = normalizeArtistMetrics(
      { followers: 0 },
      { source: 'unknown', updatedAt: now }
    );
    expect(
      buildSpotifyEnrichedFacts({ ...input, metrics: unknown }, { now })[0]
    ).toMatchObject({
      status: 'unknown',
      value: null,
      verification: 'unverified',
    });
    expect(
      buildSpotifyEnrichedFacts({ ...input, metrics: null }, { now })[0]
    ).toMatchObject({ status: 'unknown', value: null });
    const zero = normalizeArtistMetrics(
      { followers: 0 },
      { source: 'spotify_api', updatedAt: now }
    );
    expect(
      buildSpotifyEnrichedFacts({ ...input, metrics: zero }, { now })[0].value
    ).toEqual({ type: 'number', value: 0 });
  });

  it('rejects invalid and conflicting exact identities instead of attributing another artist', () => {
    const onFailure = vi.fn();
    expect(spotifyEnrichmentSubjectId('not-an-id')).toBeNull();
    expect(
      buildSpotifyEnrichedFacts(
        { ...input, returnedArtistId: '4Uwpa6zW3zzCSQvooQNksm' },
        { now, onFailure }
      )
    ).toEqual([]);
    expect(
      buildSpotifyEnrichedFacts(
        { ...input, returnedArtistId: 'not-an-id' },
        { now, onFailure }
      )
    ).toEqual([]);
    expect(onFailure).toHaveBeenCalledWith('conflicting_identity');
  });

  it('keeps stale observation dates and canonical field identity through returning sessions', () => {
    const old = normalizeArtistMetrics(
      { followers: 28_000_000 },
      { source: 'spotify_api', updatedAt: '2026-01-01T00:00:00.000Z' }
    );
    const stale = buildSpotifyEnrichedFacts(
      { ...input, metrics: old },
      { now }
    )[0];
    const current = buildSpotifyEnrichedFacts(input, { now })[0];
    expect(stale.id).toBe(current.id);
    expect(stale).toMatchObject({
      status: 'stale',
      verification: 'unverified',
    });
    expect(stale.sourceRefs[0].fetchedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
