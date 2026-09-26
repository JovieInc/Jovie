import { describe, expect, it, vi } from 'vitest';

// JOV-6529: provider-ID-backed identity enrichment for unclaimed artist
// profiles. Providers are injected fetchers; socialLinks is mocked so persist
// writes can be asserted against a fake transaction.

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({}));
vi.mock('@/lib/db/schema/links', () => ({
  socialLinks: { _: { name: 'socialLinks' } },
}));
vi.mock('@/lib/dsp-registry', () => ({
  SERVICE_TO_PROVIDER: {
    appleMusic: 'apple_music',
    soundcloud: 'soundcloud',
  },
}));
vi.mock('@/lib/spotify', () => ({
  buildSpotifyArtistUrl: (id: string) =>
    `https://open.spotify.com/artist/${id}`,
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  buildUnclaimedEnrichmentReceipt,
  discoverUnclaimedArtistIdentity,
  extractEvidenceHandles,
  persistUnclaimedDestinations,
} from '@/lib/discography/unclaimed-artist-enrichment';
import {
  readUnclaimedIdentityEnrichment,
  withIdentityEnrichmentReceipt,
} from '@/lib/profile/unclaimed-artist-profile';

const MBID = 'mb-fedde-0000';
const rel = (type: string, resource: string, extra = {}) => ({
  type,
  url: { id: 'u', resource },
  ...extra,
});
const mbArtist = (relations: Array<Record<string, unknown>>) =>
  ({ id: MBID, name: 'Fedde Le Grand', relations }) as never;
const viaMB = (
  relations: Array<Record<string, unknown>>,
  spotifyId: string | null = null
) =>
  discoverUnclaimedArtistIdentity(
    { spotifyId, musicbrainzId: MBID },
    {
      fetchMusicfetchArtist: vi.fn(async () => null),
      fetchMusicbrainzArtist: vi.fn(async () => mbArtist(relations)),
    }
  );
const mfResult = (
  services: Record<string, { link?: string; id?: string }>
) => ({ type: 'artist' as const, name: 'Fedde Le Grand', services });

describe('discoverUnclaimedArtistIdentity', () => {
  it('discovers artist-controlled destinations from exact-ID sources', async () => {
    const discovery = await discoverUnclaimedArtistIdentity(
      { spotifyId: 'sp-fedde' },
      {
        fetchMusicfetchArtist: vi.fn(async (url: string) => {
          expect(url).toBe('https://open.spotify.com/artist/sp-fedde');
          return mfResult({
            appleMusic: {
              link: 'https://music.apple.com/us/artist/fedde-le-grand/94354',
              id: '94354',
            },
            soundcloud: { link: 'https://soundcloud.com/feddelegrand' },
            musicBrainz: { id: MBID },
          });
        }),
        fetchMusicbrainzArtist: vi.fn(async (mbid: string) => {
          expect(mbid).toBe(MBID);
          return mbArtist([
            rel('official homepage', 'https://www.feddelegrand.com'),
            rel('social network', 'https://instagram.com/feddelegrand'),
          ]);
        }),
      }
    );

    expect(discovery.destinations.map(d => d.platform)).toEqual(
      expect.arrayContaining([
        'apple_music',
        'soundcloud',
        'website',
        'instagram',
      ])
    );
    expect(discovery.conflicts).toHaveLength(0);
    expect(discovery.sources).toEqual({
      musicfetch: 'verified',
      musicbrainz: 'verified',
    });
    expect(buildUnclaimedEnrichmentReceipt(discovery)).toMatchObject({
      status: 'enriched',
      shareReady: true,
    });
  });

  it('keys lookups on exact provider IDs, never display-name similarity', async () => {
    const fetchMusicfetchArtist = vi.fn(async (_url: string) => null);
    const fetchers = { fetchMusicfetchArtist, fetchMusicbrainzArtist: vi.fn() };
    await discoverUnclaimedArtistIdentity({ spotifyId: 'sp-a' }, fetchers);
    await discoverUnclaimedArtistIdentity({ spotifyId: 'sp-b' }, fetchers);
    expect(fetchMusicfetchArtist.mock.calls.map(c => c[0])).toEqual([
      'https://open.spotify.com/artist/sp-a',
      'https://open.spotify.com/artist/sp-b',
    ]);
  });

  it('rejects fan/label/database relations and ended (stale) handles', async () => {
    const discovery = await viaMB([
      rel('official fanpage', 'https://facebook.com/feddelegrandfans'),
      rel('fanpage', 'https://instagram.com/feddelegrandfan'),
      rel('other databases', 'https://www.discogs.com/artist/555'),
      rel('social network', 'https://twitter.com/old_handle', {
        end: '2019-01-01',
      }),
      rel('social network', 'https://x.com/feddelegrand'),
      rel('social network', 'https://tiktok.com/@feddelegrand'),
    ]);

    const platforms = discovery.destinations.map(d => d.platform);
    expect(platforms).toEqual(['x', 'tiktok']);
    expect(discovery.destinations[0].url).toBe('https://x.com/feddelegrand');
  });

  it('keeps multiple official domains without conflicting', async () => {
    const discovery = await viaMB([
      rel('official homepage', 'https://www.feddelegrand.com'),
      rel('official homepage', 'https://darklightrecordings.com'),
    ]);
    expect(
      discovery.destinations.filter(d => d.platform === 'website')
    ).toHaveLength(2);
    expect(discovery.conflicts).toHaveLength(0);
  });

  it('records a conflict and fails closed when sources disagree', async () => {
    const discovery = await discoverUnclaimedArtistIdentity(
      { spotifyId: 'sp-fedde', musicbrainzId: MBID },
      {
        fetchMusicfetchArtist: vi.fn(async () =>
          mfResult({ instagram: { link: 'https://instagram.com/fedde' } })
        ),
        fetchMusicbrainzArtist: vi.fn(async () =>
          mbArtist([
            rel('social network', 'https://instagram.com/feddelegrand'),
          ])
        ),
      }
    );

    expect(discovery.conflicts).toEqual([
      {
        platform: 'instagram',
        urls: [
          'https://instagram.com/fedde',
          'https://instagram.com/feddelegrand',
        ].sort(),
        sources: ['musicbrainz', 'musicfetch'],
      },
    ]);
    expect(discovery.destinations.some(d => d.platform === 'instagram')).toBe(
      false
    );
    expect(buildUnclaimedEnrichmentReceipt(discovery)).toMatchObject({
      status: 'conflicted',
      shareReady: false,
    });
  });

  it('marks destinations verified when independent sources agree', async () => {
    const discovery = await discoverUnclaimedArtistIdentity(
      { spotifyId: 'sp-fedde', musicbrainzId: MBID },
      {
        fetchMusicfetchArtist: vi.fn(async () =>
          mfResult({
            instagram: { link: 'https://www.instagram.com/feddelegrand/' },
          })
        ),
        fetchMusicbrainzArtist: vi.fn(async () =>
          mbArtist([
            rel('social network', 'https://instagram.com/feddelegrand'),
          ])
        ),
      }
    );

    expect(discovery.destinations[0]).toMatchObject({
      platform: 'instagram',
      verified: true,
      sources: ['musicbrainz', 'musicfetch'],
    });
    expect(discovery.destinations[0].confidence).toBeGreaterThan(0.95);
  });

  it('reports per-source status and share-readiness degradation', async () => {
    const empty = {
      fetchMusicfetchArtist: vi.fn(async () => null),
      fetchMusicbrainzArtist: vi.fn(async () => null),
    };

    const notFound = await discoverUnclaimedArtistIdentity(
      { spotifyId: 'sp-fedde' },
      empty
    );
    expect(notFound.sources).toEqual({
      musicfetch: 'not_found',
      musicbrainz: 'not_checked',
    });
    expect(buildUnclaimedEnrichmentReceipt(notFound)).toMatchObject({
      status: 'not_found',
      shareReady: false,
    });

    const skipped = await discoverUnclaimedArtistIdentity(
      { spotifyId: null },
      empty
    );
    expect(buildUnclaimedEnrichmentReceipt(skipped).status).toBe('skipped');

    const degraded = await discoverUnclaimedArtistIdentity(
      { spotifyId: 'sp-fedde', musicbrainzId: MBID },
      {
        fetchMusicfetchArtist: vi.fn(async () => {
          throw new Error('network down');
        }),
        fetchMusicbrainzArtist: vi.fn(async () =>
          mbArtist([rel('official homepage', 'https://www.feddelegrand.com')])
        ),
      }
    );
    expect(degraded.sources).toEqual({
      musicfetch: 'not_found',
      musicbrainz: 'verified',
    });
    expect(degraded.destinations).toHaveLength(1);
  });
});

describe('extractEvidenceHandles', () => {
  it('returns deduped handles from social identities only', async () => {
    const discovery = await viaMB([
      rel('social network', 'https://instagram.com/feddelegrand'),
      rel('youtube', 'https://youtube.com/channel/UCabc123'),
      rel('social network', 'https://tiktok.com/@feddelegrand'),
    ]);
    expect(extractEvidenceHandles(discovery)).toEqual(['feddelegrand']);
  });
});

describe('persistUnclaimedDestinations', () => {
  it('inserts destinations with provenance, skipping spotify', async () => {
    const inserted: Record<string, unknown>[] = [];
    const tx = {
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          inserted.push(values);
          return { onConflictDoNothing: () => Promise.resolve() };
        },
      }),
    };
    const count = await persistUnclaimedDestinations(tx as never, 'p1', {
      destinations: [
        {
          platform: 'spotify',
          platformType: 'dsp',
          url: 'https://open.spotify.com/artist/sp-fedde',
          identity: 'spotify:artist:sp-fedde',
          sources: ['musicfetch'],
          confidence: 1,
          verified: false,
        },
        {
          platform: 'instagram',
          platformType: 'social',
          url: 'https://instagram.com/feddelegrand',
          identity: 'instagram:feddelegrand',
          sources: ['musicfetch', 'musicbrainz'],
          confidence: 0.99,
          verified: true,
        },
      ],
      conflicts: [],
      sources: { musicfetch: 'verified', musicbrainz: 'not_checked' },
      observedAt: '2026-09-26T00:00:00.000Z',
    });

    expect(count).toBe(1);
    expect(inserted[0]).toMatchObject({
      platform: 'instagram',
      sourceType: 'ingested',
      verificationStatus: 'verified',
      confidence: '0.99',
    });
    expect((inserted[0].evidence as { sources: string[] }).sources).toContain(
      'unclaimed_identity_musicbrainz'
    );
  });
});

describe('identity enrichment receipt on the marker', () => {
  const settings = {
    unclaimedArtistProfile: {
      state: 'unclaimed',
      source: 'structured_spotify_release_credit',
      artistRegistryId: 'a1',
      provider: 'spotify',
      providerArtistId: 'sp-1',
      ownershipVerified: false,
      representationVerified: false,
      consentObtained: false,
    },
  };
  const receipt = buildUnclaimedEnrichmentReceipt({
    destinations: [],
    conflicts: [],
    sources: { musicfetch: 'not_found', musicbrainz: 'not_checked' },
    observedAt: '2026-09-26T00:00:00.000Z',
  });

  it('round-trips a receipt without overwriting marker fields', () => {
    const next = withIdentityEnrichmentReceipt(settings, receipt);
    expect(readUnclaimedIdentityEnrichment(next)).toMatchObject({
      status: 'not_found',
    });
    expect(
      (next.unclaimedArtistProfile as { providerArtistId: string })
        .providerArtistId
    ).toBe('sp-1');
  });

  it('never rewrites a claimed marker (idempotent backfill guard)', () => {
    const claimed = {
      unclaimedArtistProfile: {
        ...settings.unclaimedArtistProfile,
        state: 'claimed',
        ownershipVerified: true,
        consentObtained: true,
      },
    };
    expect(withIdentityEnrichmentReceipt(claimed, receipt)).toBe(claimed);
    expect(readUnclaimedIdentityEnrichment(claimed)).toBeNull();
  });
});
