import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const hoisted = vi.hoisted(() => ({
  getCreatorByUsername: vi.fn(),
  getContentBySlug: vi.fn(),
  getCreatorPlan: vi.fn(),
  getFeaturedTrackStaticParams: vi.fn(),
  getTrackBySlugInRelease: vi.fn(),
  resolveOpaqueInternalProfileUsername: vi.fn(),
  getArtistEntitySameAs: vi.fn(),
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
