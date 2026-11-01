import { describe, expect, it } from 'vitest';
import {
  CUTOVER_BAR,
  type ShadowReceipt,
  summarizeShadowParity,
  urlEntityType,
} from './parity-summary';

const SPOTIFY_TRACK = 'https://open.spotify.com/track/4bc0TJNIiGEJjFYDwHuOjX';

function receipt(
  jovie: Record<string, string>,
  reference: Record<string, string>,
  referenceProvenance: Record<string, string> = {},
  corpusSeedId: string | null = null
): ShadowReceipt {
  return {
    corpusSeedId,
    observedAt: '2026-10-29T00:00:00.000Z',
    results: {
      jovie: { providers: jovie },
      reference: { providers: reference, provenance: referenceProvenance },
    },
  };
}

describe('urlEntityType', () => {
  it('reads DSP entity granularity from the URL', () => {
    expect(urlEntityType(SPOTIFY_TRACK)).toBe('track');
    expect(urlEntityType('https://open.spotify.com/album/3hJ')).toBe('album');
    expect(
      urlEntityType('https://music.apple.com/us/album/x/1738005957?i=1')
    ).toBe('track');
    expect(urlEntityType('https://www.youtube.com/watch?v=LtDL1HHq954')).toBe(
      'video'
    );
    expect(urlEntityType('not a url')).toBeNull();
  });
});

describe('summarizeShadowParity', () => {
  it('does not count an echoed input URL as independent evidence', () => {
    const summary = summarizeShadowParity([
      receipt(
        {},
        { beatport: 'https://www.beatport.com/artist/tim-white/1' },
        {
          beatport: 'input_url',
        }
      ),
    ]);
    expect(summary.providers[0]).toMatchObject({
      provider: 'beatport',
      independentObservations: 0,
      misses: 0,
      coverage: null,
    });
  });

  it('separates false links from album-vs-track granularity mismatches', () => {
    const summary = summarizeShadowParity([
      receipt(
        { spotify: 'https://open.spotify.com/album/3hJTo4kVjGpEeBaBt9hl1y' },
        { spotify: 'https://open.spotify.com/track/2OmardzHXiRDA6ZZ7xNVGU' }
      ),
      receipt(
        { spotify: 'https://open.spotify.com/track/WRONG' },
        { spotify: SPOTIFY_TRACK }
      ),
      receipt({ spotify: SPOTIFY_TRACK }, { spotify: SPOTIFY_TRACK }),
    ]);
    const spotify = summary.providers[0];
    expect(spotify.granularityMismatches).toBe(1);
    expect(spotify.candidateFalseLinks).toBe(1);
    expect(spotify.agreements).toBe(1);
    expect(spotify.falseLinkRate).toBeCloseTo(1 / 3, 3);
    expect(summary.falseLinkAlarm.firing).toBe(true);
  });

  it('counts a reference-only link as a miss and lowers coverage', () => {
    const summary = summarizeShadowParity([
      receipt({}, { deezer: 'https://www.deezer.com/track/1' }),
    ]);
    expect(summary.providers[0].misses).toBe(1);
    expect(summary.providers[0].coverage).toBe(0);
    expect(summary.falseLinkAlarm.firing).toBe(false);
  });

  it('keeps every family below the bar on a corpus-only, tiny sample', () => {
    const summary = summarizeShadowParity([
      receipt(
        { spotify: SPOTIFY_TRACK },
        { spotify: SPOTIFY_TRACK },
        {},
        'seed'
      ),
    ]);
    expect(summary.organicReceipts).toBe(0);
    for (const family of summary.families) expect(family.meetsBar).toBe(false);
    expect(summary.families[0].blockers).toContain(
      'not_representative:organic_receipts_below_minimum'
    );
  });

  it('meets the link bar only with enough organic, agreeing evidence', () => {
    const many = Array.from(
      { length: CUTOVER_BAR.minIndependentObservations },
      () => receipt({ spotify: SPOTIFY_TRACK }, { spotify: SPOTIFY_TRACK })
    );
    const summary = summarizeShadowParity(many);
    expect(summary.families[0]).toEqual({
      family: 'provider_links',
      meetsBar: true,
      blockers: [],
    });
  });

  it('reports null rates and no observation window on empty input', () => {
    const summary = summarizeShadowParity([]);
    expect(summary.falseLinkAlarm.rate).toBeNull();
    expect(summary.firstObservedAt).toBeNull();
  });
});
