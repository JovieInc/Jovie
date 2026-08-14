import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getCreatorByUsername: vi.fn(),
  getContentBySlug: vi.fn(),
  getFeaturedSmartLinkStaticParams: vi.fn(),
}));

vi.mock('../_lib/data', () => ({
  getCreatorByUsername: hoisted.getCreatorByUsername,
  getContentBySlug: hoisted.getContentBySlug,
  getFeaturedSmartLinkStaticParams: hoisted.getFeaturedSmartLinkStaticParams,
}));
vi.mock('@/constants/app', () => ({ BASE_URL: 'https://jov.ie' }));

const creator = {
  id: 'profile-1',
  username: 'Real Artist',
  usernameNormalized: 'realartist',
  displayName: 'Real Artist',
};

const content = {
  id: 'release-1',
  slug: 'song',
  title: 'Song',
  type: 'single',
  artworkUrl: null,
  artworkSizes: null,
  providerLinks: [{ providerId: 'tiktok', url: 'https://tiktok.com/song' }],
};

describe('sounds page metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getCreatorByUsername.mockResolvedValue(creator);
    hoisted.getContentBySlug.mockResolvedValue(content);
  });

  it('noindexes protected synthetic artist sound pages', async () => {
    hoisted.getCreatorByUsername.mockResolvedValue({
      ...creator,
      username: 'Dua Lipa',
      usernameNormalized: 'dualipa',
      displayName: 'Dua Lipa',
    });

    const { generateMetadata } = await import('./page');
    const metadata = await generateMetadata({
      params: Promise.resolve({ username: 'dualipa', slug: 'song' }),
    });

    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });

  it('keeps legitimate sound pages indexable', async () => {
    const { generateMetadata } = await import('./page');
    const metadata = await generateMetadata({
      params: Promise.resolve({ username: 'realartist', slug: 'song' }),
    });

    expect(metadata.robots).toMatchObject({ index: true, follow: true });
  });
});
