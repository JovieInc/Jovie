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
  findSupersededReleaseSlug: vi.fn(),
  findRedirectByOldSlug: vi.fn(),
  checkPromoDownloads: vi.fn(),
  resolveOpaqueInternalProfileUsername: vi.fn(),
  getArtistEntitySameAs: vi.fn(),
  ReleaseLandingPage: vi.fn(() => null),
}));

// Exercise the real route and ContentPageBody transformation without importing
// client presentation trees that this server-component unit never renders.
vi.mock('@/app/[username]/[slug]/PreferredDspRedirect', () => ({
  PreferredDspRedirect: () => null,
}));
vi.mock('@/app/[username]/[slug]/PreserveSearchRedirect', () => ({
  PreserveSearchRedirect: () => null,
}));
vi.mock('@/app/r/[slug]/ReleaseLandingPage', () => ({
  ReleaseLandingPage: hoisted.ReleaseLandingPage,
}));
vi.mock('@/features/release', () => ({
  MysteryReleasePage: () => null,
  ScheduledReleasePage: () => null,
  UnreleasedReleaseHero: () => null,
  VideoReleasePage: () => null,
}));

vi.mock('./_lib/data', () => ({
  getCreatorByUsername: hoisted.getCreatorByUsername,
  getContentBySlug: hoisted.getContentBySlug,
  getFeaturedSmartLinkStaticParams: hoisted.getFeaturedSmartLinkStaticParams,
  getReleaseTrackList: hoisted.getReleaseTrackList,
  getUnpublishedReleasePresence: hoisted.getUnpublishedReleasePresence,
  findSupersededReleaseSlug: hoisted.findSupersededReleaseSlug,
  checkPromoDownloads: hoisted.checkPromoDownloads,
}));
vi.mock('@/lib/discography/slug', () => ({
  findRedirectByOldSlug: hoisted.findRedirectByOldSlug,
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
  // Keep a cold route import inside the existing hook budget.
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

  it('uses normal creator lookup for the reserved handle when both fixture gates are disabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '0');
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '0');
    vi.stubEnv('VERCEL_ENV', '');
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

  it.each(['PUBLIC_NOAUTH_SMOKE', 'NEXT_PUBLIC_E2E_MODE'] as const)(
    'renders the seeded fixture release when %s alone enables the gate',
    async flag => {
      vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '0');
      vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '0');
      vi.stubEnv(flag, '1');
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

      const children = (
        element as unknown as { props: { children: unknown[] } }
      ).props.children as Array<{
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
      expect(contentBody.props).toMatchObject({
        isUnreleased: false,
        releasePhase: 'released',
        showUnreleasedHero: false,
      });
      const renderContentBody = contentBody.type as (
        props: Record<string, unknown>
      ) => { type: unknown; props: Record<string, unknown> };
      const rendered = renderContentBody(contentBody.props);
      expect(rendered.type).toBe(hoisted.ReleaseLandingPage);
      expect(rendered.props).toMatchObject({
        release: {
          title: 'Screen Cert Fixture Release',
          artworkUrl: '/images/demo/artwork-1.png',
          releaseDate: '2025-01-01T00:00:00.000Z',
        },
        artist: {
          name: 'Screen Cert Fixture',
          handle: 'jovie-screen-fixture',
          avatarUrl: null,
        },
        tracking: {
          contentType: 'release',
          contentId: 'screen-cert-fixture-release',
          smartLinkSlug: 'screen-cert-release',
        },
        claimBanner: null,
      });
      expect(rendered.props.providers).toEqual(contentBody.props.allProviders);
      expect(rendered.props.providers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'spotify',
            url: 'https://open.spotify.com/search/Screen%20Cert%20Fixture',
          }),
          expect.objectContaining({
            key: 'apple_music',
            url: 'https://music.apple.com/us/search?term=Screen%20Cert%20Fixture',
          }),
        ])
      );
    }
  );

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
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '1');
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
    expect(hoisted.getContentBySlug).not.toHaveBeenCalled();
  });

  it('uses normal creator lookup for an ordinary handle even when both fixture gates are enabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '1');
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '1');
    vi.stubEnv('VERCEL_ENV', '');
    hoisted.getCreatorByUsername.mockResolvedValue(null);

    const { default: ContentSmartLinkPage } = await import('./page');
    await expect(
      ContentSmartLinkPage({
        params: Promise.resolve({
          username: 'ordinary-artist',
          slug: 'screen-cert-release',
        }),
      })
    ).rejects.toThrow('notFound');
    expect(hoisted.getCreatorByUsername).toHaveBeenCalledWith(
      'ordinary-artist'
    );
    expect(hoisted.getContentBySlug).not.toHaveBeenCalled();
  });
});

describe('superseded base slug resolution', () => {
  const creator = {
    id: 'creator-1',
    username: 'tim',
    usernameNormalized: 'tim',
    displayName: 'Tim White',
    userId: 'user-1',
    avatarUrl: null,
    settings: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.resolveOpaqueInternalProfileUsername.mockResolvedValue({
      action: 'serve',
    });
    hoisted.getCreatorByUsername.mockResolvedValue(creator);
    hoisted.getContentBySlug.mockResolvedValue(null);
    hoisted.findRedirectByOldSlug.mockResolvedValue(null);
    hoisted.findSupersededReleaseSlug.mockResolvedValue(null);
    hoisted.getUnpublishedReleasePresence.mockResolvedValue(null);
  });

  async function render(slug: string) {
    const { default: Page } = await import('./page');
    return Page({ params: Promise.resolve({ username: 'tim', slug }) });
  }

  it('308s a base slug to the single published suffixed sibling (take-me-over)', async () => {
    hoisted.findSupersededReleaseSlug.mockResolvedValue({
      currentSlug: 'take-me-over-2',
    });
    await expect(render('take-me-over')).rejects.toThrow(
      'permanentRedirect:/tim/take-me-over-2'
    );
    expect(hoisted.findSupersededReleaseSlug).toHaveBeenCalledWith(
      'creator-1',
      'take-me-over'
    );
  });

  it('prefers an explicit slug-history redirect over the superseded lookup', async () => {
    hoisted.findRedirectByOldSlug.mockResolvedValue({
      type: 'release',
      currentSlug: 'renamed',
    });
    await expect(render('old')).rejects.toThrow(
      'permanentRedirect:/tim/renamed'
    );
    expect(hoisted.findSupersededReleaseSlug).not.toHaveBeenCalled();
  });

  it('does not redirect a placeholder-owned base slug (seaside-heights) or ambiguous candidates; falls through to not found', async () => {
    // findSupersededReleaseSlug returns null for both owner-present and
    // multi-candidate cases (covered in data.test.ts).
    await expect(render('seaside-heights')).rejects.toThrow('notFound');
    expect(hoisted.getUnpublishedReleasePresence).toHaveBeenCalledWith(
      'creator-1',
      'seaside-heights'
    );
  });

  it('does not redirect the superseded base slug when published content exists', async () => {
    hoisted.getContentBySlug.mockResolvedValue({ type: 'track', slug: 'x' });
    await render('x').catch(() => undefined);
    expect(hoisted.findSupersededReleaseSlug).not.toHaveBeenCalled();
  });
});
