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
  getFeaturedSmartLinkStaticParams: vi.fn(),
  getReleaseTrackList: vi.fn(),
  getUnpublishedReleasePresence: vi.fn(),
  checkPromoDownloads: vi.fn(),
  resolveOpaqueInternalProfileUsername: vi.fn(),
  getArtistEntitySameAs: vi.fn(),
}));

vi.mock('./_lib/data', () => ({
  getCreatorByUsername: hoisted.getCreatorByUsername,
  getContentBySlug: hoisted.getContentBySlug,
  getFeaturedSmartLinkStaticParams: hoisted.getFeaturedSmartLinkStaticParams,
  getReleaseTrackList: hoisted.getReleaseTrackList,
  getUnpublishedReleasePresence: hoisted.getUnpublishedReleasePresence,
  checkPromoDownloads: hoisted.checkPromoDownloads,
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

describe('smartlink screen-cert fixture branch (JOV-7127)', () => {
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
    hoisted.getReleaseTrackList.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('never reads the database when the fixture gate is disabled, even for the reserved handle', async () => {
    hoisted.getCreatorByUsername.mockResolvedValue(null);

    const { default: ContentSmartLinkPage } = await import('./page');
    await expect(
      ContentSmartLinkPage({
        params: Promise.resolve({
          username: 'jovie-screen-fixture',
          slug: 'screen-cert-release',
        }),
      })
    ).rejects.toThrow('notFound');

    expect(hoisted.getCreatorByUsername).toHaveBeenCalledWith(
      'jovie-screen-fixture'
    );
    expect(hoisted.getContentBySlug).not.toHaveBeenCalled();
  });

  it('renders the seeded fixture release without touching the database when the gate is enabled', async () => {
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '1');
    vi.stubEnv('VERCEL_ENV', '');

    const { default: ContentSmartLinkPage } = await import('./page');
    const element = await ContentSmartLinkPage({
      params: Promise.resolve({
        username: 'jovie-screen-fixture',
        slug: 'screen-cert-release',
      }),
    });

    expect(hoisted.getCreatorByUsername).not.toHaveBeenCalled();
    expect(hoisted.getContentBySlug).not.toHaveBeenCalled();
    // Downstream fail-soft lookups (promo downloads, track list, entity
    // sameAs) are untouched by the fixture branch and still run against the
    // seeded fixture ids — they already degrade gracefully on a real DB
    // error, so there is nothing fixture-specific to bypass here.
    expect(hoisted.checkPromoDownloads).toHaveBeenCalledWith(
      'screen-cert-fixture-release',
      'jovie-screen-fixture',
      'screen-cert-release'
    );

    const children = (element as unknown as { props: { children: unknown[] } })
      .props.children as Array<{
      type: unknown;
      props?: Record<string, unknown>;
    }>;
    const contentBody = children.at(-1) as {
      type: unknown;
      props: Record<string, unknown>;
    };
    expect(contentBody.props.creator).toMatchObject({
      usernameNormalized: 'jovie-screen-fixture',
    });
    expect(contentBody.props.content).toMatchObject({
      title: 'Screen Cert Fixture Release',
      slug: 'screen-cert-release',
      type: 'release',
    });
  });

  it('404s the fixture handle for any slug other than the registered fixture release', async () => {
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '1');
    vi.stubEnv('VERCEL_ENV', '');

    const { default: ContentSmartLinkPage } = await import('./page');
    await expect(
      ContentSmartLinkPage({
        params: Promise.resolve({
          username: 'jovie-screen-fixture',
          slug: 'not-the-fixture-slug',
        }),
      })
    ).rejects.toThrow('notFound');

    expect(hoisted.getCreatorByUsername).not.toHaveBeenCalled();
    expect(hoisted.getContentBySlug).not.toHaveBeenCalled();
  });

  it('never admits the fixture branch on a real production deployment', async () => {
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '1');
    vi.stubEnv('VERCEL_ENV', 'production');
    hoisted.getCreatorByUsername.mockResolvedValue(null);

    const { default: ContentSmartLinkPage } = await import('./page');
    await expect(
      ContentSmartLinkPage({
        params: Promise.resolve({
          username: 'jovie-screen-fixture',
          slug: 'screen-cert-release',
        }),
      })
    ).rejects.toThrow('notFound');

    expect(hoisted.getCreatorByUsername).toHaveBeenCalledWith(
      'jovie-screen-fixture'
    );
  });
});
