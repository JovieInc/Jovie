import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getCreatorByUsername: vi.fn(),
  getContentBySlug: vi.fn(),
  getFeaturedSmartLinkStaticParams: vi.fn(),
}));

vi.mock('./SoundsLandingPage', () => ({ SoundsLandingPage: () => null }));
vi.mock('../PreserveSearchRedirect', () => ({
  PreserveSearchRedirect: () => null,
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
  providerLinks: [
    { providerId: 'tiktok_sound', url: 'https://tiktok.com/song' },
  ],
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

describe('sounds page delivery', () => {
  const params = () =>
    Promise.resolve({ username: 'RealArtist', slug: 'song' });
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getCreatorByUsername.mockResolvedValue(creator);
    hoisted.getContentBySlug.mockResolvedValue(content);
  });

  it('renders only supported video destinations with canonical tracking identity', async () => {
    hoisted.getContentBySlug.mockResolvedValue({
      ...content,
      providerLinks: [
        ...content.providerLinks,
        { providerId: 'spotify', url: 'https://open.spotify.com/track/1' },
      ],
    });
    const { default: Page } = await import('./page');
    const page = await Page({ params: params() });
    expect(page.props).toMatchObject({
      smartLinkPath: '/realartist/song',
      tracking: { contentId: 'release-1', smartLinkSlug: 'song' },
    });
    expect(page.props.videoProviders).toEqual([
      expect.objectContaining({
        key: 'tiktok_sound',
        url: 'https://tiktok.com/song',
      }),
    ]);
    expect(hoisted.getCreatorByUsername).toHaveBeenCalledWith('realartist');
  });

  it('redirects to the main link and canonicalizes metadata when no video destinations exist', async () => {
    hoisted.getContentBySlug.mockResolvedValue({
      ...content,
      providerLinks: [],
    });
    const { default: Page, generateMetadata } = await import('./page');
    expect((await Page({ params: params() })).props).toEqual({
      href: '/realartist/song',
    });
    expect(await generateMetadata({ params: params() })).toMatchObject({
      alternates: { canonical: 'https://jov.ie/realartist/song' },
    });
  });

  it.each(['creator', 'content'])(
    'does not emit metadata for missing %s',
    async missing => {
      if (missing === 'creator')
        hoisted.getCreatorByUsername.mockResolvedValue(null);
      else hoisted.getContentBySlug.mockResolvedValue(null);
      const { generateMetadata } = await import('./page');
      expect(await generateMetadata({ params: params() })).toEqual({
        title: 'Not Found',
      });
    }
  );
});
