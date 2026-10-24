import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getCreatorByUsername: vi.fn(),
  getContentBySlug: vi.fn(),
  getUnpublishedReleasePresence: vi.fn(),
  findRedirectByOldSlug: vi.fn(),
  resolveOpaqueInternalProfileUsername: vi.fn(),
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
  MysteryReleasePage: () => null,
  ScheduledReleasePage: () => null,
  UnreleasedReleaseHero: () => null,
  VideoReleasePage: () => null,
}));
vi.mock('./_lib/data', () => ({
  getCreatorByUsername: hoisted.getCreatorByUsername,
  getContentBySlug: hoisted.getContentBySlug,
  getFeaturedSmartLinkStaticParams: vi.fn(),
  getReleaseTrackList: vi.fn(),
  getUnpublishedReleasePresence: hoisted.getUnpublishedReleasePresence,
  checkPromoDownloads: vi.fn(),
}));
vi.mock('@/lib/discography/slug', () => ({
  findRedirectByOldSlug: hoisted.findRedirectByOldSlug,
}));
vi.mock('@/lib/profile/opaque-internal-profile-handle.server', () => ({
  resolveOpaqueInternalProfileUsername:
    hoisted.resolveOpaqueInternalProfileUsername,
}));
vi.mock('@/lib/entity/queries', () => ({
  getArtistEntitySameAs: vi.fn().mockResolvedValue([]),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
  permanentRedirect: (path: string) => {
    throw new Error(`permanentRedirect:${path}`);
  },
}));

describe('Coming soon placeholder only for upcoming releases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.resolveOpaqueInternalProfileUsername.mockResolvedValue({
      action: 'serve',
    });
    hoisted.getCreatorByUsername.mockResolvedValue({
      id: 'creator-1',
      username: 'tim',
      usernameNormalized: 'tim',
      displayName: 'Tim White',
      userId: 'user-1',
      avatarUrl: null,
      settings: {},
    });
    hoisted.getContentBySlug.mockResolvedValue(null);
    hoisted.findRedirectByOldSlug.mockResolvedValue(null);
  });

  async function render(slug: string) {
    const { default: Page } = await import('./page');
    return Page({ params: Promise.resolve({ username: 'tim', slug }) });
  }

  it('returns a real 404 when the unpublished row is not upcoming (presence null)', async () => {
    hoisted.getUnpublishedReleasePresence.mockResolvedValue(null);
    await expect(render('seaside-heights')).rejects.toThrow('notFound');
  });

  it('keeps the alerts placeholder for a genuinely upcoming release', async () => {
    hoisted.getUnpublishedReleasePresence.mockResolvedValue({
      title: 'Next Single',
    });
    await expect(render('next-single')).resolves.toBeTruthy();
  });
});
