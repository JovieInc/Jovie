import { Children, isValidElement } from 'react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { PreferredDspRedirect } from '@/app/[username]/[slug]/PreferredDspRedirect';
import { ReleaseLandingPage } from '@/app/r/[slug]/ReleaseLandingPage';

const hoisted = vi.hoisted(() => ({
  getCreatorByUsername: vi.fn(),
  getContentBySlug: vi.fn(),
  getCreatorPlan: vi.fn(),
  getFeaturedTrackStaticParams: vi.fn(),
  getTrackBySlugInRelease: vi.fn(),
  resolveOpaqueInternalProfileUsername: vi.fn(),
  getArtistEntitySameAs: vi.fn(),
}));

vi.mock('@/app/r/[slug]/ReleaseLandingPage', () => ({
  ReleaseLandingPage: () => null,
}));
vi.mock('@/app/[username]/[slug]/PreferredDspRedirect', () => ({
  PreferredDspRedirect: () => null,
}));

vi.mock('../_lib/data', () => ({
  getCreatorByUsername: hoisted.getCreatorByUsername,
  getContentBySlug: hoisted.getContentBySlug,
  getCreatorPlan: hoisted.getCreatorPlan,
  getFeaturedTrackStaticParams: hoisted.getFeaturedTrackStaticParams,
  getTrackBySlugInRelease: hoisted.getTrackBySlugInRelease,
}));
vi.mock('@/constants/app', async importOriginal => {
  const actual = await importOriginal<typeof import('@/constants/app')>();
  return { ...actual, BASE_URL: 'https://jov.ie' };
});
vi.mock('@/lib/profile/opaque-internal-profile-handle.server', () => ({
  resolveOpaqueInternalProfileUsername:
    hoisted.resolveOpaqueInternalProfileUsername,
}));
vi.mock('@/lib/entity/queries', () => ({
  getArtistEntitySameAs: hoisted.getArtistEntitySameAs,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
  permanentRedirect: (path: string) => {
    throw new Error(`permanentRedirect:${path}`);
  },
}));

describe('smartlink-track screen-cert fixture branch (JOV-7127)', () => {
  // Warm the module cache once; the first-ever dynamic import of a Server
  // Component this size can exceed the default per-test timeout.
  beforeAll(async () => {
    await import('./page');
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.resolveOpaqueInternalProfileUsername.mockResolvedValue({
      action: 'serve',
    });
    hoisted.getArtistEntitySameAs.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('never reads the database when the fixture gate is disabled, even for the reserved handle', async () => {
    hoisted.getCreatorByUsername.mockResolvedValue(null);

    const { default: TrackDeepLinkPage } = await import('./page');
    await expect(
      TrackDeepLinkPage({
        params: Promise.resolve({
          username: 'jovie-screen-fixture',
          slug: 'screen-cert-release',
          trackSlug: 'screen-cert-track',
        }),
      })
    ).rejects.toThrow('notFound');

    expect(hoisted.getCreatorByUsername).toHaveBeenCalledWith(
      'jovie-screen-fixture'
    );
    expect(hoisted.getContentBySlug).not.toHaveBeenCalled();
    expect(hoisted.getTrackBySlugInRelease).not.toHaveBeenCalled();
  });

  it('renders the seeded fixture track without touching the database when the gate is enabled', async () => {
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '1');
    vi.stubEnv('VERCEL_ENV', '');

    const { default: TrackDeepLinkPage } = await import('./page');
    const element = await TrackDeepLinkPage({
      params: Promise.resolve({
        username: 'jovie-screen-fixture',
        slug: 'screen-cert-release',
        trackSlug: 'screen-cert-track',
      }),
    });

    expect(hoisted.getCreatorByUsername).not.toHaveBeenCalled();
    expect(hoisted.getContentBySlug).not.toHaveBeenCalled();
    expect(hoisted.getTrackBySlugInRelease).not.toHaveBeenCalled();
    expect(hoisted.getCreatorPlan).not.toHaveBeenCalled();

    const children = (element as unknown as { props: { children: unknown[] } })
      .props.children as Array<{
      type: unknown;
      props?: Record<string, unknown>;
    }>;
    const releaseLanding = children.at(-1) as {
      type: unknown;
      props: Record<string, unknown>;
    };
    expect(releaseLanding.props.release).toMatchObject({
      title: 'Screen Cert Fixture Track',
    });
    expect(releaseLanding.props.parentRelease).toMatchObject({
      title: 'Screen Cert Fixture Release',
      url: '/jovie-screen-fixture/screen-cert-release',
    });
  });

  it('404s the fixture handle for any slug pair other than the registered fixture', async () => {
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '1');
    vi.stubEnv('VERCEL_ENV', '');

    const { default: TrackDeepLinkPage } = await import('./page');
    await expect(
      TrackDeepLinkPage({
        params: Promise.resolve({
          username: 'jovie-screen-fixture',
          slug: 'screen-cert-release',
          trackSlug: 'not-the-fixture-track',
        }),
      })
    ).rejects.toThrow('notFound');

    expect(hoisted.getCreatorByUsername).not.toHaveBeenCalled();
  });

  it('never admits the fixture branch on a real production deployment', async () => {
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '1');
    vi.stubEnv('VERCEL_ENV', 'production');
    hoisted.getCreatorByUsername.mockResolvedValue(null);

    const { default: TrackDeepLinkPage } = await import('./page');
    await expect(
      TrackDeepLinkPage({
        params: Promise.resolve({
          username: 'jovie-screen-fixture',
          slug: 'screen-cert-release',
          trackSlug: 'screen-cert-track',
        }),
      })
    ).rejects.toThrow('notFound');

    expect(hoisted.getCreatorByUsername).toHaveBeenCalledWith(
      'jovie-screen-fixture'
    );
  });
});

describe('published track metadata and access', () => {
  const params = () =>
    Promise.resolve({
      username: 'TestArtist',
      slug: 'album',
      trackSlug: 'song',
    });
  const track = () => ({
    id: 'track-1',
    type: 'track',
    title: 'Song',
    slug: 'song',
    artworkUrl: null,
    releaseDate: new Date('2026-01-01'),
    providerLinks: [
      { providerId: 'spotify', url: 'https://open.spotify.com/track/1' },
    ],
    durationMs: 123456,
  });
  beforeEach(() => {
    vi.resetAllMocks();
    hoisted.resolveOpaqueInternalProfileUsername.mockResolvedValue({
      action: 'serve',
    });
    hoisted.getCreatorByUsername.mockResolvedValue({
      id: 'creator-1',
      username: 'testartist',
      usernameNormalized: 'testartist',
      displayName: 'Artist',
      settings: {},
    });
    hoisted.getContentBySlug.mockResolvedValue({
      id: 'release-1',
      type: 'release',
      title: 'Album',
    });
    hoisted.getTrackBySlugInRelease.mockResolvedValue(track());
    hoisted.getArtistEntitySameAs.mockResolvedValue([]);
    hoisted.getCreatorPlan.mockResolvedValue({
      canAccessFutureReleases: false,
    });
  });

  it('uses the nested canonical URL and measured track duration', async () => {
    const { generateMetadata } = await import('./page');
    const metadata = await generateMetadata({ params: params() });
    expect(metadata).toMatchObject({
      title: 'Song by Artist',
      alternates: { canonical: 'https://jov.ie/testartist/album/song' },
      other: {
        'music:duration': '123',
        'music:album': 'https://jov.ie/testartist/album',
      },
      openGraph: { images: [{ url: 'https://jov.ie/og/default.png' }] },
    });
    expect(hoisted.getTrackBySlugInRelease).toHaveBeenCalledWith(
      'release-1',
      'song'
    );
  });

  it.each(['creator', 'release', 'track'])(
    'does not publish metadata when the %s is missing',
    async missing => {
      if (missing === 'creator')
        hoisted.getCreatorByUsername.mockResolvedValue(null);
      if (missing === 'release')
        hoisted.getContentBySlug.mockResolvedValue({ type: 'track' });
      if (missing === 'track')
        hoisted.getTrackBySlugInRelease.mockResolvedValue(null);
      const { generateMetadata, default: Page } = await import('./page');
      expect(await generateMetadata({ params: params() })).toEqual({
        title: 'Not Found',
      });
      await expect(Page({ params: params() })).rejects.toThrow('notFound');
    }
  );

  it('enforces future-release entitlement on both metadata and page content', async () => {
    hoisted.getTrackBySlugInRelease.mockResolvedValue({
      ...track(),
      releaseDate: new Date('2099-01-01'),
    });
    const { generateMetadata, default: Page } = await import('./page');
    expect(await generateMetadata({ params: params() })).toEqual({
      title: 'Not Found',
    });
    await expect(Page({ params: params() })).rejects.toThrow('notFound');
    hoisted.getCreatorPlan.mockResolvedValue({ canAccessFutureReleases: true });
    expect(await generateMetadata({ params: params() })).toMatchObject({
      title: 'Song by Artist',
    });
    const page = await Page({ params: params() });
    const children = Children.toArray(page.props.children);
    expect(
      children.some(
        child => isValidElement(child) && child.type === PreferredDspRedirect
      )
    ).toBe(false);
    expect(
      children.find(
        child => isValidElement(child) && child.type === ReleaseLandingPage
      )
    ).toMatchObject({ props: { release: { title: 'Song' } } });
  });

  it('noindexes opaque identities before reading public data', async () => {
    hoisted.resolveOpaqueInternalProfileUsername.mockResolvedValue({
      action: 'not_found',
    });
    const { generateMetadata, default: Page } = await import('./page');
    expect(await generateMetadata({ params: params() })).toEqual({
      title: 'Not Found',
      robots: { index: false, follow: false },
    });
    await expect(Page({ params: params() })).rejects.toThrow('notFound');
    expect(hoisted.getCreatorByUsername).not.toHaveBeenCalled();
  });
});
