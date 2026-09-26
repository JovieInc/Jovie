import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DbOrTransaction } from '@/lib/db';
import {
  applyArtistIdentityEnrichment as apply,
  classifyMusicBrainzRelation as classify,
  enrichArtistIdentity as enrich,
  extractMusicBrainzIdentityLinks as extractLinks,
  identityKeyForLink,
  matchMusicBrainzArtistForIsrcs as matchArtist,
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
  ({ id: 'mbid-1', relations }) as MusicBrainzArtist;
const IG = 'https://instagram.com/feddelegrand';
const SITE = 'https://feddelegrand.com';
const platforms = (links: readonly { platform: string }[]) =>
  links
    .map(l => l.platform)
    .sort()
    .join();

describe('classify/extract url-rels', () => {
  it('maps typed relations, host-classifies socials, rejects unsafe', () => {
    expect(classify('official homepage', SITE)).toMatchObject({
      platform: 'website',
    });
    expect(classify('social network', IG)).toMatchObject({
      platform: 'instagram',
    });
    expect(
      classify('social network', 'https://fedde.example.com')
    ).toMatchObject({ platform: 'website' });
    expect(classify('official homepage', 'javascript:alert(1)')).toBeNull();
    expect(classify('streaming music', SITE)).toBeNull();
  });

  it('dedupes canonical identities and conflicts distinct ones', () => {
    const clean = extractLinks(
      mbArtist([
        rel('official homepage', `https://www.feddelegrand.com/`),
        rel('instagram', IG),
        rel('twitter', 'https://twitter.com/feddelegrand'),
      ])
    );
    expect(clean.conflictedPlatforms.size).toBe(0);
    expect(platforms(clean.links)).toBe('instagram,twitter,website');

    const dupes = extractLinks(
      mbArtist([
        rel('instagram', 'https://instagram.com/@FeddeLeGrand/'),
        rel('social network', 'https://www.instagram.com/feddelegrand'),
        rel('instagram', 'https://instagram.com/fedde_fanclub'),
        rel('official homepage', 'https://old.example.com', { ended: true }),
      ])
    );
    expect(dupes.conflictedPlatforms.has('instagram')).toBe(true);
    expect(dupes.links).toHaveLength(0);
  });
});

describe('matchMusicBrainzArtistForIsrcs', () => {
  it('short-circuits without a provider', async () => {
    available.mockReturnValue(false);
    await expect(matchArtist(['A', 'B'])).resolves.toEqual({
      kind: 'not_checked',
      reason: 'musicbrainz_unavailable',
    });
  });

  it('matches the exact artist shared across ISRCs', async () => {
    lookup.mockResolvedValue(recording('mb-1'));
    await expect(matchArtist(['A', 'B'])).resolves.toEqual({
      kind: 'matched',
      mbid: 'mb-1',
      isrcCount: 2,
    });
    lookup.mockRejectedValue(new Error('rate limited'));
    await expect(matchArtist(['A', 'B'])).resolves.toEqual({
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
  };

  it('merges Spotify identity with matched MusicBrainz url-rels', async () => {
    lookup.mockResolvedValue(recording('mb-1'));
    getArtist.mockResolvedValue(
      mbArtist([rel('instagram', IG), rel('official homepage', SITE)]) as never
    );
    const result = await enrich(input);
    expect(result.musicBrainzArtistId).toBe('mbid-1');
    expect(platforms(result.links)).toBe('instagram,spotify,website');
    expect(result.shareReadiness).toBe('ready');
  });

  it('marks unchecked, conflicted, and degraded outcomes distinctly', async () => {
    const unchecked = await enrich({ ...input, isrcs: ['A'] });
    expect(unchecked.shareReadiness).toBe('limited');

    lookup.mockResolvedValue([
      {
        'artist-credit': [
          { artist: { id: 'mb-1' } },
          { artist: { id: 'mb-2' } },
        ],
      },
    ] as never);
    const tied = await enrich(input);
    expect(tied.shareReadiness).toBe('limited');
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
    const applied = await apply(first.tx, 'prof-1', enrichment);
    expect(applied.inserted).toBe(1);
    expect(first.inserted[0]).toMatchObject({
      creatorProfileId: 'prof-1',
      platform: 'instagram',
      sourceType: 'ingested',
    });
  });
});
