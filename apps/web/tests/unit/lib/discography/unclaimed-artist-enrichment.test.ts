import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const hoisted = vi.hoisted(() => ({
  findMusicBrainzArtistIdsByUrl: vi.fn(),
  getMusicBrainzArtist: vi.fn(),
  isMusicBrainzAvailable: vi.fn(),
}));

vi.mock('@/lib/dsp-enrichment/providers/musicbrainz', () => ({
  findMusicBrainzArtistIdsByUrl: hoisted.findMusicBrainzArtistIdsByUrl,
  getMusicBrainzArtist: hoisted.getMusicBrainzArtist,
  isMusicBrainzAvailable: hoisted.isMusicBrainzAvailable,
}));
vi.mock('@/lib/db', () => ({ db: { select: vi.fn() } }));
vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: vi.fn(async (op: (tx: unknown) => unknown) =>
    op({})
  ),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/spotify', () => ({
  buildSpotifyArtistUrl: (id: string) =>
    `https://open.spotify.com/artist/${id}`,
}));

const {
  buildEnrichmentReceipt,
  discoverUnclaimedArtistIdentity,
  extractMusicBrainzDestinations,
  extractOutboundSocialLinks,
  mergeDestinations,
} = await import('@/lib/discography/unclaimed-artist-enrichment');

const rel = (type: string, resource: string, extra: object = {}) =>
  ({ type, url: { resource, id: 'u' }, ...extra }) as never;
const link =
  (source: string) => (platform: string, url: string, id: string) => ({
    platform,
    platformType: 'x',
    url,
    canonicalId: id,
    source,
  });
const mb = link('musicbrainz_url_rel');
const site = link('official_site');

describe('extractMusicBrainzDestinations', () => {
  it('classifies artist-controlled rels and drops metadata references', () => {
    const links = extractMusicBrainzDestinations([
      rel('official homepage', 'https://feddelegrand.com'),
      rel('social network', 'https://instagram.com/feddelegrand'),
      rel('social network', 'https://twitter.com/feddelegrand'),
      rel('youtube', 'https://youtube.com/@feddelegrand'),
      // label, fan and reference pages are never artist destinations
      rel('other databases', 'https://discogs.com/artist/1'),
      rel('wikidata', 'https://www.wikidata.org/wiki/Q1'),
      rel('label', 'https://example.com/label'),
    ]);
    const platforms = links.map(l => l.platform);
    expect(platforms).toEqual(
      expect.arrayContaining(['website', 'instagram', 'twitter', 'youtube'])
    );
    expect(platforms).toHaveLength(4);
  });

  it('drops ended rels (stale handles) and never re-derives Spotify', () => {
    const links = extractMusicBrainzDestinations([
      rel('social network', 'https://instagram.com/oldhandle', {
        ended: true,
      }),
      rel('social network', 'https://twitter.com/deadhandle', {
        end: '2020-01-01',
      }),
      rel('streaming music', 'https://open.spotify.com/artist/x'),
      rel('social network', 'https://instagram.com/livehandle'),
    ]);
    expect(links).toHaveLength(1);
    expect(links[0].canonicalId).toBe('instagram:livehandle');
  });
});

describe('extractOutboundSocialLinks', () => {
  it('keeps outbound social links and ignores self/mailto/relative links', () => {
    const html = `
      <a href="https://instagram.com/feddelegrand">IG</a>
      <a href='https://tiktok.com/@feddelegrand'>TT</a>
      <a href="https://feddelegrand.com/tour">Tour</a>
      <a href="mailto:mgmt@feddelegrand.com">Mail</a>
      <a href="/relative">rel</a>`;
    const ids = extractOutboundSocialLinks(html, 'feddelegrand.com')
      .map(l => l.canonicalId)
      .sort();
    expect(ids).toEqual(['instagram:feddelegrand', 'tiktok:feddelegrand']);
  });
});

describe('mergeDestinations', () => {
  it('dedupes canonical identities across sources and marks verified', () => {
    const { destinations } = mergeDestinations([
      mb(
        'instagram',
        'https://instagram.com/feddelegrand',
        'instagram:feddelegrand'
      ),
      site(
        'instagram',
        'https://www.instagram.com/feddelegrand/',
        'instagram:feddelegrand'
      ),
      mb('twitter', 'https://twitter.com/feddelegrand', 'twitter:feddelegrand'),
    ]);
    expect(destinations).toHaveLength(2);
    const ig = destinations.find(d => d.platform === 'instagram');
    expect(ig?.status).toBe('verified');
    expect(ig?.sources).toEqual(['musicbrainz_url_rel', 'official_site']);
    expect(destinations.find(d => d.platform === 'twitter')?.status).toBe(
      'unverified'
    );
  });

  it('flags multiple official domains as a conflict, never auto-picks', () => {
    const { destinations, conflicts } = mergeDestinations([
      mb('website', 'https://feddelegrand.com', 'website:feddelegrand.com'),
      mb('website', 'https://flgmusic.com', 'website:flgmusic.com'),
    ]);
    expect(conflicts).toEqual([
      'multiple official domains: feddelegrand.com, flgmusic.com',
    ]);
    expect(
      destinations
        .filter(d => d.platform === 'website')
        .every(d => d.status === 'conflicted')
    ).toBe(true);
  });
});

describe('buildEnrichmentReceipt', () => {
  const base = {
    checkedAt: '2026-09-26T00:00:00.000Z',
    musicbrainzId: 'mbid-1',
    sources: ['spotify_artist', 'musicbrainz_url_rel'],
    conflicts: [] as string[],
  };
  const dest = (
    platform: string,
    status: 'verified' | 'unverified' | 'conflicted'
  ) => ({
    platform,
    platformType: 'x',
    url: `https://${platform}.example/${platform}`,
    canonicalId: `${platform}:id`,
    sources: ['musicbrainz_url_rel'],
    status,
  });

  it('reports not_found for a completed pass with no destinations', () => {
    const receipt = buildEnrichmentReceipt({ ...base, destinations: [] });
    expect(receipt.status).toBe('not_found');
    expect(receipt.shareReady).toBe(false);
  });

  it('is verified and share-ready when a destination is corroborated', () => {
    const receipt = buildEnrichmentReceipt({
      ...base,
      destinations: [dest('instagram', 'verified')],
    });
    expect(receipt.status).toBe('verified');
    expect(receipt.fields.instagram).toBe('verified');
    expect(receipt.shareReady).toBe(true);
  });

  it('marks conflicted and never grants share-ready over a conflict', () => {
    const receipt = buildEnrichmentReceipt({
      ...base,
      conflicts: ['multiple official domains: a.com, b.com'],
      destinations: [dest('website', 'conflicted')],
    });
    expect(receipt.status).toBe('conflicted');
    expect(receipt.fields.website).toBe('conflicted');
    expect(receipt.shareReady).toBe(false);
  });
});

describe('discoverUnclaimedArtistIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.isMusicBrainzAvailable.mockReturnValue(true);
    hoisted.findMusicBrainzArtistIdsByUrl.mockResolvedValue([]);
  });

  it('returns null when no trusted source is reachable (not_checked)', async () => {
    hoisted.isMusicBrainzAvailable.mockReturnValue(false);
    expect(await discoverUnclaimedArtistIdentity('sp-fedde')).toBeNull();
  });

  it('resolves identity by exact provider URL, never by display name', async () => {
    hoisted.findMusicBrainzArtistIdsByUrl.mockResolvedValue(['mbid-fedde']);
    hoisted.getMusicBrainzArtist.mockResolvedValue({
      id: 'mbid-fedde',
      name: 'Fedde Le Grand',
      relations: [
        rel('social network', 'https://instagram.com/feddelegrand'),
        rel('official homepage', 'https://feddelegrand.com'),
      ],
    });
    const evidence = await discoverUnclaimedArtistIdentity('sp-fedde');
    expect(hoisted.findMusicBrainzArtistIdsByUrl).toHaveBeenCalledWith(
      'https://open.spotify.com/artist/sp-fedde'
    );
    expect(evidence?.musicbrainzId).toBe('mbid-fedde');
    expect(evidence?.destinations.map(d => d.platform)).toEqual(
      expect.arrayContaining(['instagram', 'website'])
    );
    expect(evidence?.handleCandidates).toContain('feddelegrand');
  });

  it('records an unresolved conflict when two entities claim one ID', async () => {
    hoisted.findMusicBrainzArtistIdsByUrl.mockResolvedValue([
      'mbid-a',
      'mbid-b',
    ]);
    hoisted.getMusicBrainzArtist.mockResolvedValue({
      id: 'mbid-a',
      name: 'Colliding Act',
      relations: [],
    });
    const evidence = await discoverUnclaimedArtistIdentity('sp-collide');
    expect(evidence?.conflicts[0]).toMatch(/multiple MusicBrainz entities/);
    const receipt = buildEnrichmentReceipt(evidence!);
    expect(receipt.status).toBe('conflicted');
    expect(receipt.shareReady).toBe(false);
  });
});
