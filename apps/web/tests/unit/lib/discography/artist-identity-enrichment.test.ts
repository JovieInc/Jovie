import { describe, expect, it } from 'vitest';

import {
  classifyMusicBrainzRelation,
  deriveShareReadiness,
  extractMusicBrainzIdentityLinks,
  needsIdentityEnrichment,
  pickMusicBrainzArtistByIsrcSupport,
  readArtistIdentityEnrichment,
} from '@/lib/discography/artist-identity-enrichment';
import type { MusicBrainzArtist } from '@/lib/dsp-enrichment/types';

function rel(
  type: string,
  resource: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    type,
    'type-id': `${type}-id`,
    url: { id: `url-${resource}`, resource },
    ...overrides,
  };
}

function mbArtist(relations: ReturnType<typeof rel>[]): MusicBrainzArtist {
  return {
    id: 'mbid-1',
    name: 'Fedde Le Grand',
    relations,
  } as MusicBrainzArtist;
}

describe('classifyMusicBrainzRelation', () => {
  it('maps typed relations to their platform', () => {
    expect(
      classifyMusicBrainzRelation(
        'official homepage',
        'https://feddelegrand.com'
      )
    ).toMatchObject({ platform: 'website' });
    expect(
      classifyMusicBrainzRelation('youtube', 'https://youtube.com/@fedde')
    ).toMatchObject({ platform: 'youtube' });
  });

  it('classifies generic social-network relations by host', () => {
    expect(
      classifyMusicBrainzRelation(
        'social network',
        'https://instagram.com/feddelegrand'
      )
    ).toMatchObject({ platform: 'instagram' });
    expect(
      classifyMusicBrainzRelation(
        'social network',
        'https://feddelegrand.example.com'
      )
    ).toMatchObject({ platform: 'website' });
  });

  it('rejects unsafe or unmapped relations', () => {
    expect(
      classifyMusicBrainzRelation('official homepage', 'javascript:alert(1)')
    ).toBeNull();
    expect(
      classifyMusicBrainzRelation(
        'streaming music',
        'https://open.spotify.com/artist/x'
      )
    ).toBeNull();
  });
});

describe('extractMusicBrainzIdentityLinks', () => {
  it('extracts and normalizes artist-controlled links', () => {
    const { links, conflicts } = extractMusicBrainzIdentityLinks(
      mbArtist([
        rel('official homepage', 'https://www.feddelegrand.com/'),
        rel('instagram', 'https://instagram.com/feddelegrand'),
        rel('twitter', 'https://twitter.com/feddelegrand'),
      ])
    );
    expect(conflicts).toEqual({});
    const platforms = links.map(l => l.platform).sort();
    expect(platforms).toEqual(['instagram', 'twitter', 'website']);
  });

  it('dedupes same-identity URLs and conflicts distinct identities per platform', () => {
    // e.g. an official handle plus a fan/label page both listed
    const { links, conflicts } = extractMusicBrainzIdentityLinks(
      mbArtist([
        rel('instagram', 'https://instagram.com/@FeddeLeGrand/'),
        rel('social network', 'https://www.instagram.com/feddelegrand'),
        rel('instagram', 'https://instagram.com/feddelegrand_fanclub'),
        rel('official homepage', 'https://old-fan-site.example.com', {
          ended: true,
        }),
      ])
    );
    // Same canonical identity collapses; the fanclub handle conflicts; the
    // ended relation is ignored.
    expect(links.filter(l => l.platform === 'instagram')).toHaveLength(0);
    expect(conflicts.instagram).toHaveLength(2);
    expect(links.filter(l => l.platform === 'website')).toHaveLength(0);
  });
});

describe('pickMusicBrainzArtistByIsrcSupport', () => {
  it('selects the artist backed by the most distinct ISRCs', () => {
    const outcome = pickMusicBrainzArtistByIsrcSupport([
      { isrc: 'A', artistIds: ['mb-1', 'mb-label'] },
      { isrc: 'B', artistIds: ['mb-1'] },
      { isrc: 'C', artistIds: ['mb-1'] },
      { isrc: 'D', artistIds: ['mb-label'] },
    ]);
    expect(outcome).toEqual({ kind: 'matched', mbid: 'mb-1', isrcCount: 3 });
  });

  it('reports conflicted on a support tie — never resolves by name', () => {
    const outcome = pickMusicBrainzArtistByIsrcSupport([
      { isrc: 'A', artistIds: ['mb-1'] },
      { isrc: 'B', artistIds: ['mb-1'] },
      { isrc: 'C', artistIds: ['mb-2'] },
      { isrc: 'D', artistIds: ['mb-2'] },
    ]);
    expect(outcome).toEqual({
      kind: 'conflicted',
      candidates: ['mb-1', 'mb-2'],
    });
  });

  it('returns not_found below the minimum ISRC support', () => {
    expect(
      pickMusicBrainzArtistByIsrcSupport([{ isrc: 'A', artistIds: ['mb-1'] }])
    ).toEqual({ kind: 'not_found' });
  });
});

describe('deriveShareReadiness', () => {
  it('requires two verified destinations and no conflicts', () => {
    const base = { observedAt: 'now', sources: [] };
    expect(
      deriveShareReadiness({
        spotify: { ...base, status: 'verified' },
        website: { ...base, status: 'verified' },
      })
    ).toBe('ready');
    expect(
      deriveShareReadiness({
        spotify: { ...base, status: 'verified' },
        website: { ...base, status: 'not_found' },
      })
    ).toBe('limited');
    expect(
      deriveShareReadiness({
        spotify: { ...base, status: 'verified' },
        website: { ...base, status: 'verified' },
        instagram: { ...base, status: 'conflicted' },
      })
    ).toBe('limited');
  });
});

describe('identityEnrichment settings roundtrip', () => {
  const enrichment = {
    observedAt: '2026-09-26T00:00:00.000Z',
    musicBrainzArtistId: 'mb-1',
    links: [],
    platformStatus: {
      spotify: {
        status: 'verified',
        observedAt: '2026-09-26T00:00:00.000Z',
        sources: ['spotify'],
      },
    },
    shareReadiness: 'limited' as const,
  };

  it('reads back a stored record and reports it as fresh', () => {
    const settings = { identityEnrichment: enrichment };
    expect(readArtistIdentityEnrichment(settings)).toEqual(enrichment);
    expect(needsIdentityEnrichment(settings)).toBe(false);
  });

  it('treats missing or malformed records as needing enrichment', () => {
    expect(readArtistIdentityEnrichment({})).toBeNull();
    expect(
      readArtistIdentityEnrichment({ identityEnrichment: { junk: true } })
    ).toBeNull();
    expect(needsIdentityEnrichment({})).toBe(true);
  });

  it('re-enriches records older than the freshness cutoff', () => {
    const settings = { identityEnrichment: enrichment };
    expect(
      needsIdentityEnrichment(settings, new Date('2026-09-27T00:00:00Z'))
    ).toBe(true);
    expect(
      needsIdentityEnrichment(settings, new Date('2026-09-25T00:00:00Z'))
    ).toBe(false);
  });
});
