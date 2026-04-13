import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getContentBySlugMock,
  getCreatorByUsernameMock,
  getFeaturedSmartLinkStaticParamsMock,
} = vi.hoisted(() => ({
  getContentBySlugMock: vi.fn(),
  getCreatorByUsernameMock: vi.fn(),
  getFeaturedSmartLinkStaticParamsMock: vi.fn().mockResolvedValue([]),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  permanentRedirect: vi.fn(),
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
  getContentBySlug: getContentBySlugMock,
  getCreatorByUsername: getCreatorByUsernameMock,
  getFeaturedSmartLinkStaticParams: getFeaturedSmartLinkStaticParamsMock,
  getReleaseTrackList: vi.fn(),
}));

describe('smart-link metadata', () => {
  beforeEach(() => {
    vi.resetModules();
    getCreatorByUsernameMock.mockReset();
    getContentBySlugMock.mockReset();
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
});
