import {
  type EnrichedFact,
  enrichedFactId,
} from '@/lib/profile-facts/enrichment';

/** Public synthetic evidence for interaction fixtures; never a live provider claim. */
export function sourceFixture(
  overrides: Partial<EnrichedFact> = {}
): EnrichedFact {
  const subjectId = 'spotify:artist:fixture';
  return {
    schemaVersion: 1,
    id: enrichedFactId(subjectId, 'spotify.followers', 'followers'),
    subject: {
      id: subjectId,
      type: 'person',
      displayName: 'Fixture Artist',
      roles: ['musician'],
      identity: 'resolved',
    },
    predicate: 'spotify.followers',
    value: { type: 'number', value: 9900 },
    unit: 'followers',
    status: 'resolved',
    verification: 'verified',
    permission: 'public',
    confidence: null,
    sourceRefs: [
      {
        id: 'fixture-spotify',
        subjectId,
        kind: 'direct',
        provider: 'spotify',
        originUrl: 'https://open.spotify.com/artist/fixture',
        url: 'https://open.spotify.com/artist/fixture',
        fetchedAt: new Date().toISOString(),
        asOf: null,
        status: 'available',
        freshness: 'fresh',
        verification: 'verified',
        confidence: null,
      },
    ],
    ...overrides,
  };
}
