import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  spotify: vi.fn(),
  apple: vi.fn(),
  deezer: vi.fn(),
  fetch: vi.fn(),
  available: vi.fn(() => true),
  images: vi.fn(() => ({ large: 'https://i.scdn.co/image/source.jpg' })),
}));
vi.mock('@/lib/dsp-enrichment/providers', () => ({
  getSpotifyArtistProfile: mocks.spotify,
  getAppleMusicArtist: mocks.apple,
  getDeezerArtist: mocks.deezer,
  isSpotifyAvailable: mocks.available,
  isAppleMusicAvailable: mocks.available,
  isDeezerAvailable: mocks.available,
  extractSpotifyImageUrls: mocks.images,
  extractAppleMusicImageUrls: mocks.images,
  extractDeezerImageUrls: mocks.images,
}));
vi.mock('@/lib/ingestion/strategies/base', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/ingestion/strategies/base')>()),
  fetchDocument: mocks.fetch,
}));

import { readSourceIdentity } from './source-identity';

describe('readSourceIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.available.mockReturnValue(true);
    mocks.images.mockReturnValue({
      large: 'https://i.scdn.co/image/source.jpg',
    });
  });
  it.each([
    'https://instagram.com/tim',
    'https://tiktok.com/@tim',
    'https://127.0.0.1/admin',
    'https://unlisted.example/profile',
    'http://tidal.com/artist/1',
    'https://tidal.com:8443/artist/1',
    (() => {
      const url = new URL('https://tidal.com/artist/1');
      url.username = 'fixture';
      url.password = 'fixture';
      return url.toString();
    })(),
    'bad',
  ])('never fetches blocked or arbitrary source %s', async url => {
    expect((await readSourceIdentity(url)).status).not.toBe('available');
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.spotify).not.toHaveBeenCalled();
  });
  it('reads the exact Spotify artist ID and reports observed photo without claiming ownership', async () => {
    mocks.spotify.mockResolvedValue({
      name: 'Different Source Name',
      images: [],
    });
    const result = await readSourceIdentity(
      'https://open.spotify.com/artist/abc'
    );
    expect(mocks.spotify).toHaveBeenCalledWith('abc');
    expect(result).toMatchObject({
      status: 'available',
      displayName: 'Different Source Name',
      photo: { kind: 'profile', source: 'connector', verified: false },
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each([
    ['https://music.apple.com/us/artist/tim/123', 'apple'],
    ['https://music.apple.com/ca/artist/tim/123', 'apple'],
    ['https://www.deezer.com/en/artist/123', 'deezer'],
  ])('uses the exact provider source %s', async (url, provider) => {
    mocks.apple.mockResolvedValue({
      attributes: { name: 'Source Name', artwork: {} },
    });
    mocks.deezer.mockResolvedValue({ name: 'Source Name' });
    expect((await readSourceIdentity(url)).displayName).toBe('Source Name');
    if (provider === 'apple') {
      expect(mocks.apple).toHaveBeenCalledWith('123', {
        storefront: new URL(url).pathname.split('/')[1],
      });
    } else {
      expect(mocks.deezer).toHaveBeenCalledWith('123');
    }
  });
  it('does not report empty public-page metadata as available', async () => {
    mocks.fetch.mockResolvedValue({ html: '<html><body></body></html>' });
    expect(
      (await readSourceIdentity('https://tidal.com/artist/123')).status
    ).toBe('unavailable');
  });
  it.each([
    [
      'https://soundcloud.com/artist',
      'https://soundcloud.com/artist',
      'https://i1.sndcdn.com/avatars-profile-t500x500.jpg',
    ],
    [
      'https://www.deezer.com/artist/123',
      'https://www.deezer.com/us/artist/123',
      'https://cdn-images.dzcdn.net/images/artist/abcdef/500x500.jpg',
    ],
  ])(
    'recognizes the bound avatar namespace for %s',
    async (url, canonical, image) => {
      mocks.available.mockReturnValue(false);
      mocks.fetch.mockResolvedValue({
        html: `<meta property="og:type" content="music.musician"><meta property="og:url" content="${canonical}"><meta property="og:title" content="Source Name"><meta property="og:image" content="${image}">`,
      });
      expect(await readSourceIdentity(url)).toMatchObject({
        displayName: 'Source Name',
        photo: { kind: 'profile', verified: false, url: image },
      });
    }
  );
  it.each([
    [
      'https://soundcloud.com/other',
      'https://i1.sndcdn.com/avatars-profile-t500x500.jpg',
    ],
    [
      'https://soundcloud.com/artist',
      'https://i1.sndcdn.com/artworks-cover-t500x500.jpg',
    ],
  ])(
    'keeps mismatched profile metadata or artwork generic',
    async (canonical, image) => {
      mocks.fetch.mockResolvedValue({
        html: `<meta property="og:type" content="music.musician"><meta property="og:url" content="${canonical}"><meta property="og:title" content="Source Name"><meta property="og:image" content="${image}">`,
      });
      expect(
        (await readSourceIdentity('https://soundcloud.com/artist')).photo.kind
      ).toBe('generic');
    }
  );
  it('keeps square OG profile artwork generic and bounded', async () => {
    mocks.fetch.mockResolvedValue({
      html: '<meta property="og:type" content="profile"><meta property="og:title" content="Tim White"><meta property="og:image" content="https://resources.tidal.com/artwork.jpg">',
    });
    const result = await readSourceIdentity('https://tidal.com/artist/123');
    expect(result).toMatchObject({
      status: 'available',
      displayName: null,
      pageTitle: 'Tim White',
      photo: { kind: 'generic', verified: false },
    });
    expect(mocks.fetch.mock.calls[0][1]).toMatchObject({
      timeoutMs: 4000,
      maxRetries: 0,
    });
  });
  it('uses explicit YouTube channel avatar fields rather than the page banner', async () => {
    const channelData = {
      metadata: { channelMetadataRenderer: { title: 'Channel Name' } },
      header: {
        c4TabbedHeaderRenderer: {
          avatar: {
            thumbnails: [
              { url: 'https://yt3.googleusercontent.com/actual-avatar.jpg' },
            ],
          },
        },
      },
    };
    mocks.fetch.mockResolvedValue({
      html: `<script>var ytInitialData = ${JSON.stringify(channelData)};</script><meta property="og:image" content="https://example.com/banner.jpg">`,
    });
    const result = await readSourceIdentity('https://www.youtube.com/@actual');
    expect(mocks.fetch).toHaveBeenCalledWith(
      'https://www.youtube.com/@actual/about',
      expect.objectContaining({
        timeoutMs: 4000,
        maxRetries: 0,
        maxResponseBytes: 6_000_000,
        allowedHosts: new Set(['youtube.com', 'www.youtube.com']),
      })
    );
    expect(result).toMatchObject({
      status: 'available',
      displayName: 'Channel Name',
      photo: {
        url: 'https://yt3.googleusercontent.com/actual-avatar.jpg',
        kind: 'profile',
        verified: false,
      },
    });
  });

  it('retains unavailable identity when the bounded YouTube read fails', async () => {
    mocks.fetch.mockRejectedValue(new Error('Response too large'));
    const result = await readSourceIdentity(
      'https://www.youtube.com/channel/UCactual'
    );
    expect(result).toMatchObject({
      status: 'unavailable',
      displayName: null,
      photo: { kind: 'missing', verified: false },
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch.mock.calls[0][0]).toBe(
      'https://www.youtube.com/channel/UCactual/about'
    );
  });

  it('reports failures honestly and allows a subsequent request to recover', async () => {
    mocks.fetch
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValueOnce({
        html: '<meta property="og:title" content="Source">',
      });
    expect(
      (await readSourceIdentity('https://tidal.com/artist/1')).status
    ).toBe('unavailable');
    expect(
      (await readSourceIdentity('https://tidal.com/artist/1')).status
    ).toBe('available');
  });
  it('does not forward insecure OG images', async () => {
    mocks.fetch.mockResolvedValue({
      html: '<meta property="og:image" content="http://example.com/image.png">',
    });
    expect(
      (await readSourceIdentity('https://tidal.com/artist/1')).photo.kind
    ).toBe('missing');
  });
});
