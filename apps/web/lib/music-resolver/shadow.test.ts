import { describe, expect, it, vi } from 'vitest';
import {
  compareResolverResults,
  MUSIC_RESOLVER_PARITY_CORPUS,
  musicResolverInputKey,
  musicResolverInputSchema,
} from './shadow';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));

const resolved = (providers: Record<string, string>) => ({
  status: 'resolved' as const,
  providers,
  provenance: {},
  confidence: 1,
  requestCount: 1,
});

describe('music resolver shadow contract', () => {
  it('normalizes and fingerprints every input kind deterministically', () => {
    const parsed = JSON.parse(
      '[{"kind":"url","url":"https://example.com/track/1"},{"kind":"isrc","isrc":"usaaa2600001"},{"kind":"upc","upc":"00123456789012"},{"kind":"metadata","artist":"Tim White","title":"Take Me Over"},{"kind":"jovie","entityType":"release","id":"84b9af39-d740-4106-bdf0-09764ba825e2"}]'
    ).map((value: unknown) => musicResolverInputSchema.parse(value));
    expect(parsed.map((value: { kind: string }) => value.kind)).toHaveLength(5);
    expect(musicResolverInputKey(parsed[0])).toHaveLength(64);
    expect(parsed[1]).toMatchObject({ isrc: 'USAAA2600001', territory: 'US' });
  });

  it('preserves URL disagreements for adjudication without choosing Musicfetch as truth', () => {
    const comparison = compareResolverResults(
      resolved({ spotify: 'https://open.spotify.com/track/jovie' }),
      resolved({ spotify: 'https://open.spotify.com/track/musicfetch' })
    );
    expect(comparison).toMatchObject({
      status: 'disagreement',
      adjudication: 'pending',
      falsePositiveRate: null,
      providerCoverage: { jovie: 1, musicfetch: 1, overlap: 0 },
    });
    expect(comparison.urlDisagreements).toHaveLength(1);
  });

  it('locks the real founder corpus across every required risk class', () => {
    const coverage = MUSIC_RESOLVER_PARITY_CORPUS.flatMap(seed => seed.covers);
    expect(new Set(coverage).size).toBe(11);
  });
});
