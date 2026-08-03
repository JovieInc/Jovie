import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getContentBySlugMock,
  getCreatorByUsernameMock,
  getFeaturedSmartLinkStaticParamsMock,
  getUnpublishedReleasePresenceMock,
  notFoundMock,
  redirectMock,
} = vi.hoisted(() => ({
  getContentBySlugMock: vi.fn(),
  getCreatorByUsernameMock: vi.fn(),
  getFeaturedSmartLinkStaticParamsMock: vi.fn().mockResolvedValue([]),
  getUnpublishedReleasePresenceMock: vi.fn(),
  notFoundMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  permanentRedirect: vi.fn(),
  redirect: redirectMock,
}));

vi.mock('@/app/[username]/[slug]/PreferredDspRedirect', () => ({
  PreferredDspRedirect: () => null,
}));

vi.mock('@/app/[username]/[slug]/PreserveSearchRedirect', () => ({
  PreserveSearchRedirect: () => null,
}));

vi.mock('@/app/r/[slug]/ReleaseLandingPage', () => ({
  ReleaseLandingPage: () => null,
}));

vi.mock('@/features/release', () => ({
  ScheduledReleasePage: () => null,
  UnreleasedReleaseHero: () => null,
}));

vi.mock('@/app/[username]/[slug]/_lib/data', () => ({
  checkPromoDownloads: vi.fn(),
  getContentBySlug: getContentBySlugMock,
  getCreatorByUsername: getCreatorByUsernameMock,
  getFeaturedSmartLinkStaticParams: getFeaturedSmartLinkStaticParamsMock,
  getReleaseTrackList: vi.fn(),
  getUnpublishedReleasePresence: getUnpublishedReleasePresenceMock,
}));

vi.mock('@/lib/discography/slug', () => ({
  findRedirectByOldSlug: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/entity/queries', () => ({
  getArtistEntitySameAs: vi.fn().mockResolvedValue([]),
}));

describe('smart-link metadata', () => {
  beforeEach(() => {
    vi.resetModules();
    getCreatorByUsernameMock.mockReset();
    getContentBySlugMock.mockReset();
    getUnpublishedReleasePresenceMock.mockReset();
    getUnpublishedReleasePresenceMock.mockResolvedValue(null);
    notFoundMock.mockReset();
    notFoundMock.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND');
    });
    redirectMock.mockReset();
    redirectMock.mockImplementation(() => {
      throw new Error('NEXT_REDIRECT');
    });
    getFeaturedSmartLinkStaticParamsMock.mockResolvedValue([]);

    getCreatorByUsernameMock.mockResolvedValue({
      id: 'creator-1',
      username: 'dualipa',
      usernameNormalized: 'dualipa',
      displayName: 'Dua Lipa',
    });
  });

  it('uses the nested canonical URL for tracks that belong to a release', async () => {
    getContentBySlugMock.mockResolvedValue({
      id: 'track-1',
      type: 'track',
      slug: 'neon-skyline',
      releaseSlug: 'future-nostalgia',
      title: 'Neon Skyline',
      artworkUrl: 'https://example.com/cover.jpg',
      artworkSizes: null,
      releaseDate: new Date('2024-01-01T00:00:00Z'),
      providerLinks: [{ providerId: 'spotify', url: 'https://spotify.test' }],
      previewUrl: null,
    });

    const { generateMetadata } = await import('@/app/[username]/[slug]/page');
    const metadata = await generateMetadata({
      params: Promise.resolve({ username: 'dualipa', slug: 'neon-skyline' }),
    });

    expect(metadata.alternates?.canonical).toBe(
      'https://jov.ie/dualipa/future-nostalgia/neon-skyline'
    );
    expect(metadata.openGraph?.url).toBe(
      'https://jov.ie/dualipa/future-nostalgia/neon-skyline'
    );
  });

  it('keeps the short canonical URL for standalone releases', async () => {
    getContentBySlugMock.mockResolvedValue({
      id: 'release-1',
      type: 'release',
      slug: 'future-nostalgia',
      releaseSlug: null,
      title: 'Future Nostalgia',
      artworkUrl: 'https://example.com/cover.jpg',
      artworkSizes: null,
      releaseDate: new Date('2024-01-01T00:00:00Z'),
      providerLinks: [{ providerId: 'spotify', url: 'https://spotify.test' }],
      previewUrl: null,
      releaseType: 'album',
      totalTracks: 11,
      credits: null,
      durationMs: null,
      isrc: null,
      trackNumber: null,
    });

    const { generateMetadata } = await import('@/app/[username]/[slug]/page');
    const metadata = await generateMetadata({
      params: Promise.resolve({
        username: 'dualipa',
        slug: 'future-nostalgia',
      }),
    });

    expect(metadata.alternates?.canonical).toBe(
      'https://jov.ie/dualipa/future-nostalgia'
    );
    expect(metadata.openGraph?.url).toBe(
      'https://jov.ie/dualipa/future-nostalgia'
    );
  });

  it('renders published content before considering a matching mode alias', async () => {
    getContentBySlugMock.mockResolvedValue({
      id: 'track-music',
      type: 'track',
      slug: 'music',
      releaseSlug: null,
      releaseId: null,
      releaseTitle: null,
      title: 'Music',
      artworkUrl: 'https://example.com/music.jpg',
      artworkSizes: null,
      releaseDate: new Date('2024-01-01T00:00:00Z'),
      revealDate: null,
      providerLinks: [],
      previewUrl: null,
      previewMetadata: null,
      releaseType: null,
      totalTracks: null,
      credits: null,
      durationMs: null,
      isrc: null,
      trackNumber: null,
    });

    const { default: ProfileAliasResolverPage } = await import(
      '@/app/[username]/[...slug]/page'
    );
    const result = await ProfileAliasResolverPage({
      params: Promise.resolve({
        username: 'dualipa',
        slug: ['music', '__profile-mode-alias', 'resolve'],
      }),
      searchParams: Promise.resolve({ source: 'qr' }),
    });

    expect(result).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(getUnpublishedReleasePresenceMock).not.toHaveBeenCalled();
  });

  it('uses a matching mode alias only after content lookups miss', async () => {
    getContentBySlugMock.mockResolvedValue(null);

    const { default: ProfileAliasResolverPage } = await import(
      '@/app/[username]/[...slug]/page'
    );

    await expect(
      ProfileAliasResolverPage({
        params: Promise.resolve({
          username: 'dualipa',
          slug: ['music', '__profile-mode-alias', 'resolve'],
        }),
        searchParams: Promise.resolve({ source: 'qr' }),
      })
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(getUnpublishedReleasePresenceMock).toHaveBeenCalledWith(
      'creator-1',
      'music'
    );
    expect(redirectMock).toHaveBeenCalledWith('/dualipa?mode=listen&source=qr');
  });

  it('keeps direct marker paths for arbitrary slugs on the catch-all 404', async () => {
    const { default: ProfileAliasResolverPage } = await import(
      '@/app/[username]/[...slug]/page'
    );

    await expect(
      ProfileAliasResolverPage({
        params: Promise.resolve({
          username: 'dualipa',
          slug: ['future-nostalgia', '__profile-mode-alias', 'resolve'],
        }),
      })
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(getCreatorByUsernameMock).not.toHaveBeenCalled();
    expect(getContentBySlugMock).not.toHaveBeenCalled();
  });
});
