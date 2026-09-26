import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DbOrTransaction } from '@/lib/db';
import {
  applyArtistIdentityEnrichment,
  classifyMusicBrainzRelation,
  enrichArtistIdentity,
  extractMusicBrainzIdentityLinks,
  identityKeyForLink,
  matchMusicBrainzArtistForIsrcs,
} from '@/lib/discography/artist-identity-enrichment';
import {
  getMusicBrainzArtist,
  isMusicBrainzAvailable,
  lookupMusicBrainzByIsrc,
} from '@/lib/dsp-enrichment/providers/musicbrainz';
import type { MusicBrainzArtist } from '@/lib/dsp-enrichment/types';

vi.mock('@/lib/dsp-enrichment/providers/musicbrainz', () => ({
  isMusicBrainzAvailable: vi.fn(() => true),
  lookupMusicBrainzByIsrc: vi.fn(),
  getMusicBrainzArtist: vi.fn(),
}));

const lookup = vi.mocked(lookupMusicBrainzByIsrc);
const getArtist = vi.mocked(getMusicBrainzArtist);
const available = vi.mocked(isMusicBrainzAvailable);

beforeEach(() => {
  vi.clearAllMocks();
  available.mockReturnValue(true);
});

const recording = (id: string) =>
  [{ 'artist-credit': [{ artist: { id } }] }] as never;
const rel = (type: string, resource: string, over: object = {}) => ({
  type,
  url: { resource },
  ...over,
});
const mbArtist = (relations: ReturnType<typeof rel>[]) =>
  ({ id: 'mbid-1', name: 'Fedde Le Grand', relations }) as MusicBrainzArtist;
const IG = 'https://instagram.com/feddelegrand';
const SITE = 'https://feddelegrand.com';

describe('classify/extract url-rels', () => {
  it('maps typed relations and host-classifies generic social networks', () => {
    expect(
      classifyMusicBrainzRelation('official homepage', SITE)
    ).toMatchObject({ platform: 'website' });
    expect(
      classifyMusicBrainzRelation('youtube', 'https://youtube.com/@fedde')
    ).toMatchObject({ platform: 'youtube' });
    expect(classifyMusicBrainzRelation('social network', IG)).toMatchObject({
      platform: 'instagram',
    });
    expect(
      classifyMusicBrainzRelation('social network', 'https://fedde.example.com')
    ).toMatchObject({ platform: 'website' });
    expect(
      classifyMusicBrainzRelation('official homepage', 'javascript:alert(1)')
    ).toBeNull();
    expect(classifyMusicBrainzRelation('streaming music', SITE)).toBeNull();
  });

  it('dedupes canonical identities and conflicts distinct ones', () => {
    const clean = extractMusicBrainzIdentityLinks(
      mbArtist([
        rel('official homepage', `https://www.feddelegrand.com/`),
        rel('instagram', IG),
        rel('twitter', 'https://twitter.com/feddelegrand'),
      ])
    );
    expect(clean.conflictedPlatforms.size).toBe(0);
    expect(
      clean.links
        .map(l => l.platform)
        .sort()
        .join()
    ).toBe('instagram,twitter,website');

    const dupes = extractMusicBrainzIdentityLinks(
      mbArtist([
        rel('instagram', 'https://instagram.com/@FeddeLeGrand/'),
        rel('social network', 'https://www.instagram.com/feddelegrand'),
        rel('instagram', 'https://instagram.com/fedde_fanclub'),
        rel('official homepage', 'https://old-fan-site.example.com', {
          ended: true,
        }),
      ])
    );
    expect(dupes.links.filter(l => l.platform === 'instagram')).toHaveLength(0);
    expect(dupes.conflictedPlatforms.has('instagram')).toBe(true);
    expect(dupes.links.filter(l => l.platform === 'website')).toHaveLength(0);
  });
});

describe('matchMusicBrainzArtistForIsrcs', () => {
  it('short-circuits without enough ISRCs or a provider', async () => {
    await expect(matchMusicBrainzArtistForIsrcs(['A'])).resolves.toEqual({
      kind: 'not_checked',
      reason: 'insufficient_isrcs',
    });
    available.mockReturnValue(false);
    await expect(matchMusicBrainzArtistForIsrcs(['A', 'B'])).resolves.toEqual({
      kind: 'not_checked',
      reason: 'musicbrainz_unavailable',
    });
  });

  it('matches the exact artist shared across ISRCs', async () => {
    lookup
      .mockResolvedValueOnce(recording('mb-1'))
      .mockResolvedValueOnce(recording('mb-1'));
    await expect(matchMusicBrainzArtistForIsrcs(['A', 'B'])).resolves.toEqual({
      kind: 'matched',
      mbid: 'mb-1',
      isrcCount: 2,
    });
    lookup.mockRejectedValue(new Error('rate limited'));
    await expect(matchMusicBrainzArtistForIsrcs(['A', 'B'])).resolves.toEqual({
      kind: 'not_checked',
      reason: 'musicbrainz_error',
    });
  });
});

describe('enrichArtistIdentity', () => {
  const input = {
    spotifyId: 'sp-1',
    spotifyUrl: 'https://open.spotify.com/artist/sp-1',
    isrcs: ['A', 'B'],
    now: new Date('2026-09-26T00:00:00Z'),
  };

  it('merges Spotify identity with matched MusicBrainz url-rels', async () => {
    lookup.mockResolvedValue(recording('mb-1'));
    getArtist.mockResolvedValue(
      mbArtist([rel('instagram', IG), rel('official homepage', SITE)]) as never
    );
    const result = await enrichArtistIdentity(input);
    expect(result.musicBrainzArtistId).toBe('mbid-1');
    expect(
      result.links
        .map(l => l.platform)
        .sort()
        .join()
    ).toBe('instagram,spotify,website');
    expect(result.platformStatus.instagram.status).toBe('verified');
    expect(result.platformStatus.tiktok.status).toBe('not_found');
    expect(result.shareReadiness).toBe('ready');
  });

  it('marks unchecked, conflicted, and degraded platforms distinctly', async () => {
    const unchecked = await enrichArtistIdentity({ ...input, isrcs: ['A'] });
    expect(unchecked.musicBrainzArtistId).toBeNull();
    expect(unchecked.platformStatus.website.status).toBe('not_checked');
    expect(unchecked.platformStatus.spotify.status).toBe('verified');
    expect(unchecked.shareReadiness).toBe('limited');
    expect(unchecked.links).toHaveLength(1);

    lookup.mockResolvedValue([
      {
        'artist-credit': [
          { artist: { id: 'mb-1' } },
          { artist: { id: 'mb-2' } },
        ],
      },
    ] as never);
    const tied = await enrichArtistIdentity(input);
    expect(tied.platformStatus.musicbrainz.status).toBe('conflicted');

    lookup.mockResolvedValue(recording('mb-1'));
    getArtist.mockRejectedValue(new Error('mb down'));
    const degraded = await enrichArtistIdentity(input);
    expect(degraded.platformStatus.website.status).toBe('not_checked');
    expect(degraded.shareReadiness).toBe('limited');
  });
});

describe('applyArtistIdentityEnrichment', () => {
  const link = (platform: string, url: string) => ({
    platform,
    platformType: 'social',
    url,
    canonicalIdentity: identityKeyForLink(platform, url),
    confidence: 1,
    source: 'spotify' as const,
    sourceEntityId: 'sp-1',
  });
  const enrichment = {
    observedAt: '2026-09-26T00:00:00.000Z',
    musicBrainzArtistId: 'mb-1',
    links: [
      link('spotify', 'https://open.spotify.com/artist/sp-1'),
      link('instagram', IG),
    ],
    platformStatus: {},
    shareReadiness: 'ready' as const,
  };

  function fakeTx(existing: { url: string; platform: string }[]) {
    const inserted: Record<string, unknown>[] = [];
    const tx = {
      select: () => ({ from: () => ({ where: async () => existing }) }),
      insert: () => ({
        values: (v: Record<string, unknown>) => (
          inserted.push(v), { onConflictDoNothing: async () => {} }
        ),
      }),
      update: () => ({ set: () => ({ where: async () => {} }) }),
    } as unknown as DbOrTransaction;
    return { tx, inserted };
  }

  it('inserts only new canonical identities, idempotently', async () => {
    const existing = [
      { url: 'https://open.spotify.com/artist/sp-1', platform: 'spotify' },
    ];
    const first = fakeTx(existing);
    const applied = await applyArtistIdentityEnrichment(
      first.tx,
      'prof-1',
      enrichment
    );
    expect(applied.inserted).toBe(1);
    expect(first.inserted[0]).toMatchObject({
      creatorProfileId: 'prof-1',
      platform: 'instagram',
      sourceType: 'ingested',
    });

    const second = fakeTx([...existing, { url: IG, platform: 'instagram' }]);
    const reapplied = await applyArtistIdentityEnrichment(
      second.tx,
      'prof-1',
      enrichment
    );
    expect(reapplied.inserted).toBe(0);
    expect(second.inserted).toHaveLength(0);
  });
});
