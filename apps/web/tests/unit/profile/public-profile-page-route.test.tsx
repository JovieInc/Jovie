/**
 * Behavior tests for the public profile page route (JOV-5778).
 *
 * Executes the real `app/[username]/page.tsx` server component and
 * `generateMetadata` with the profile loader, opaque-handle resolution, and
 * the page's independent secondary reads mocked at their boundaries.
 * ArtistPageContent is an async server component, so the render path follows
 * the repo's async-page convention (see tests/unit/app/waitlist/invite-page):
 * await the page, then execute the Suspense child, then renderToStaticMarkup.
 *
 * - invalid/reserved usernames 404 via notFound() before any profile lookup
 * - opaque internal handles 404 or permanently redirect before rendering
 * - not_found profiles 404 before the streamed Suspense boundary
 * - error results render the server-side recovery state, not a thrown 500
 * - the unfazed handle renders its dedicated client surface, no loader call
 * - secondary read failures degrade instead of failing the render
 * - generateMetadata 404s missing profiles and noindexes error results
 *
 * Related surface: public-profile-isr (docs/TEST_RISK_REGISTER.md, 75% target).
 */

import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicProfileLoaderResult } from '@/app/[username]/_lib/public-profile-loader';
import ArtistPage, { generateMetadata } from '@/app/[username]/page';

const {
  getProfileAndLinksMock,
  resolveOpaqueInternalProfileUsernameMock,
  notFoundMock,
  permanentRedirectMock,
  getPublicTourDatesMock,
  getReleasesForProfileLiteMock,
  getLiveMerchCardsForProfileMock,
  getCreditedArtistsWithProfilesMock,
  getStructuredReleaseCollaboratorsMock,
  getEntityIdentityLinksMock,
  getMerchMvpEnabledMock,
  getProfileAlertOptInVariantMock,
  getProfilePacAssignmentMock,
  schedulePublicCollaboratorProfileReconciliationMock,
  loadPublicReleaseCreditsMock,
  getCachedPublicReleasesForProfileMock,
} = vi.hoisted(() => ({
  getProfileAndLinksMock: vi.fn(),
  resolveOpaqueInternalProfileUsernameMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  permanentRedirectMock: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
  getPublicTourDatesMock: vi.fn(),
  getReleasesForProfileLiteMock: vi.fn(),
  getLiveMerchCardsForProfileMock: vi.fn(),
  getCreditedArtistsWithProfilesMock: vi.fn(),
  getStructuredReleaseCollaboratorsMock: vi.fn(),
  getEntityIdentityLinksMock: vi.fn(),
  getMerchMvpEnabledMock: vi.fn(),
  getProfileAlertOptInVariantMock: vi.fn(),
  getProfilePacAssignmentMock: vi.fn(),
  schedulePublicCollaboratorProfileReconciliationMock: vi.fn(),
  loadPublicReleaseCreditsMock: vi.fn(),
  getCachedPublicReleasesForProfileMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  permanentRedirect: permanentRedirectMock,
  redirect: vi.fn(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fetcher: () => Promise<unknown>) => () => fetcher(),
}));

vi.mock('@/app/[username]/_lib/public-profile-loader', () => ({
  getProfileAndLinks: (...args: unknown[]) => getProfileAndLinksMock(...args),
}));

vi.mock('@/lib/profile/opaque-internal-profile-handle.server', () => ({
  resolveOpaqueInternalProfileUsername: (...args: unknown[]) =>
    resolveOpaqueInternalProfileUsernameMock(...args),
}));

vi.mock('@/lib/tour-dates/queries', () => ({
  getUpcomingTourDatesForProfile: (...args: unknown[]) =>
    getPublicTourDatesMock(...args),
}));

vi.mock('@/lib/discography/queries', () => ({
  getReleasesForProfileLite: (...args: unknown[]) =>
    getReleasesForProfileLiteMock(...args),
}));

vi.mock('@/lib/releases/public-release-loader', () => ({
  getCachedPublicReleasesForProfile: (...args: unknown[]) =>
    getCachedPublicReleasesForProfileMock(...args),
}));

vi.mock('@/app/[username]/[slug]/_lib/data', () => ({
  loadPublicReleaseCredits: (...args: unknown[]) =>
    loadPublicReleaseCreditsMock(...args),
}));

vi.mock('@/lib/merch/service', () => ({
  getLiveMerchCardsForProfile: (...args: unknown[]) =>
    getLiveMerchCardsForProfileMock(...args),
}));

vi.mock('@/lib/discography/artist-queries', () => ({
  getCreditedArtistsWithProfiles: (...args: unknown[]) =>
    getCreditedArtistsWithProfilesMock(...args),
  getStructuredReleaseCollaborators: (...args: unknown[]) =>
    getStructuredReleaseCollaboratorsMock(...args),
}));

vi.mock('@/lib/entity/queries', () => ({
  getEntityIdentityLinks: (...args: unknown[]) =>
    getEntityIdentityLinksMock(...args),
}));

vi.mock('@/lib/flags/profile-variant', () => ({
  getMerchMvpEnabled: (...args: unknown[]) => getMerchMvpEnabledMock(...args),
  getProfileAlertOptInVariant: (...args: unknown[]) =>
    getProfileAlertOptInVariantMock(...args),
  getProfilePacAssignment: (...args: unknown[]) =>
    getProfilePacAssignmentMock(...args),
}));

vi.mock('@/lib/profile/public-collaborator-reconciliation', () => ({
  schedulePublicCollaboratorProfileReconciliation: (...args: unknown[]) =>
    schedulePublicCollaboratorProfileReconciliationMock(...args),
}));

vi.mock('@/lib/analytics/tracking-token', () => ({
  getClientTrackingToken: () => ({ token: 'token', expiresAt: 0 }),
}));

vi.mock('@/lib/env-server', () => ({
  env: new Proxy(
    {},
    { get: (_target, key: string) => (key === 'NODE_ENV' ? 'test' : undefined) }
  ),
}));

// The page's render tree leans on interactive client components that require
// browser-only APIs. They are pass-through stubs here; the route-under-test's
// server behavior (validation, redirects, 404s, recovery fallback) is the
// coverage target.
vi.mock('@/features/profile/StaticArtistPage', () => ({
  StaticArtistPage: (props: Record<string, unknown>) =>
    createElement('div', {
      'data-testid': 'static-artist-page',
      'data-handle': String(
        (props.artist as { handle?: string })?.handle ?? ''
      ),
    }),
}));

vi.mock('@/components/features/profile/UnfazedProfileClient', () => ({
  UnfazedProfileClient: () =>
    createElement('div', { 'data-testid': 'unfazed-client' }),
}));

vi.mock('@/features/profile/ProfileViewTracker', () => ({
  ProfileViewTracker: () => createElement('noscript', null, 'view-tracker'),
}));
vi.mock('@/features/tracking/JoviePixel', () => ({
  JoviePixel: () => createElement('noscript', null, 'jovie-pixel'),
}));
vi.mock('@/features/tracking/MetaPixel', () => ({
  MetaPixel: () => createElement('noscript', null, 'meta-pixel'),
}));
vi.mock('@/features/profile/DesktopQrOverlayClient', () => ({
  DesktopQrOverlayClient: () => createElement('noscript', null, 'qr-overlay'),
}));
vi.mock('@/components/features/ask-jovie/AskJovieWidget', () => ({
  AskJovieWidget: () => createElement('noscript', null, 'ask-jovie'),
}));
vi.mock('@/features/tracking/SignupFunnelBeacon', () => ({
  SignupFunnelBeacon: () => createElement('noscript', null, 'signup-beacon'),
}));
vi.mock('@/features/profile/ProfileAeoContent', () => ({
  ProfileAeoContent: () => createElement('noscript', null, 'aeo-content'),
}));
vi.mock('@/features/profile/ProfileAeoProofClaimCard', () => ({
  ProfileAeoProofClaimCard: () =>
    createElement('noscript', null, 'aeo-proof-card'),
}));
vi.mock('@/app/[username]/_components/PublicClaimBanner', () => ({
  PublicClaimBanner: () => createElement('noscript', null, 'claim-banner'),
}));

const OK_RESULT: PublicProfileLoaderResult = {
  profile: {
    id: 'profile-1',
    user_id: 'user-1',
    creator_type: 'artist',
    username: 'testartist',
    display_name: 'Test Artist',
    bio: 'bio',
    avatar_url: null,
    spotify_url: 'https://open.spotify.com/artist/123',
    apple_music_url: null,
    youtube_url: null,
    spotify_id: 'spotify-123',
    apple_music_id: null,
    youtube_music_id: null,
    deezer_id: null,
    tidal_id: null,
    soundcloud_id: null,
    musicbrainz_id: null,
    is_public: true,
    is_verified: false,
    is_claimed: true,
    claim_token: null,
    claimed_at: null,
    settings: {},
    theme: {},
    location: null,
    active_since_year: null,
    is_featured: false,
    marketing_opt_out: false,
    profile_views: 0,
    username_normalized: 'testartist',
    search_text: 'test artist testartist bio',
    display_title: 'Test Artist',
    profile_completion_pct: 75,
    created_at: '2026-01-15T12:00:00.000Z',
    updated_at: '2026-01-15T12:00:00.000Z',
  },
  links: [],
  contacts: [],
  creatorIsPro: false,
  creatorClerkId: 'clerk-1',
  creatorMetaPixelId: null,
  genres: ['house'],
  latestRelease: {
    id: 'release-1',
    title: 'Latest Track',
    slug: 'latest-track',
  } as never,
  pressPhotos: [],
  status: 'ok',
};

const EMPTY_CATALOG_RESULT: PublicProfileLoaderResult = {
  ...OK_RESULT,
  latestRelease: null,
};

const NOT_FOUND_RESULT: PublicProfileLoaderResult = {
  ...OK_RESULT,
  profile: null,
  creatorClerkId: null,
  status: 'not_found',
};

const ERROR_RESULT: PublicProfileLoaderResult = {
  ...OK_RESULT,
  profile: null,
  creatorClerkId: null,
  status: 'error',
};

/** Await the async page (redirect/404 throws propagate) and render nothing. */
async function executeArtistPage(username: string): Promise<ReactNode> {
  return ArtistPage({ params: Promise.resolve({ username }) });
}

/**
 * ArtistPageContent is an async server component wrapped in Suspense —
 * renderToStaticMarkup cannot execute it. Reach into the page tree, execute
 * the async child directly (its own notFound()/redirect throws propagate),
 * and return its rendered element for static markup.
 */
async function renderArtistPageContent(username: string): Promise<string> {
  const pageTree = (await executeArtistPage(username)) as ReactElement<{
    children: ReactElement;
  }>;
  const child = pageTree.props.children as ReactElement<
    Record<string, unknown>,
    (props: Record<string, unknown>) => Promise<ReactNode>
  >;
  expect(typeof child.type).toBe('function');
  const rendered = await child.type(child.props);
  return renderToStaticMarkup(rendered);
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveOpaqueInternalProfileUsernameMock.mockResolvedValue({
    action: 'serve',
  });
  getProfileAndLinksMock.mockResolvedValue(OK_RESULT);
  getPublicTourDatesMock.mockResolvedValue([]);
  getReleasesForProfileLiteMock.mockResolvedValue([]);
  getCachedPublicReleasesForProfileMock.mockResolvedValue([]);
  loadPublicReleaseCreditsMock.mockResolvedValue([]);
  getLiveMerchCardsForProfileMock.mockResolvedValue([]);
  getCreditedArtistsWithProfilesMock.mockResolvedValue([]);
  getStructuredReleaseCollaboratorsMock.mockResolvedValue([]);
  getEntityIdentityLinksMock.mockResolvedValue([]);
  getMerchMvpEnabledMock.mockResolvedValue(false);
  getProfileAlertOptInVariantMock.mockResolvedValue('button');
  getProfilePacAssignmentMock.mockResolvedValue('control');
});

describe('public profile page route behavior (JOV-5778)', () => {
  it('executes the real content render for a public profile', async () => {
    const html = await renderArtistPageContent('testartist');

    expect(html).toContain('static-artist-page');
    expect(html).toContain('Test Artist');
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(permanentRedirectMock).not.toHaveBeenCalled();
    expect(getProfileAndLinksMock).toHaveBeenCalledWith('testartist');
  });

  it('rejects usernames that fail the handle pattern with 404', async () => {
    await expect(executeArtistPage('not a handle!')).rejects.toThrow(
      'NEXT_NOT_FOUND'
    );
    expect(notFoundMock).toHaveBeenCalled();
    expect(getProfileAndLinksMock).not.toHaveBeenCalled();
  });

  it('rejects usernames shorter than the minimum length with 404', async () => {
    await expect(executeArtistPage('ab')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(getProfileAndLinksMock).not.toHaveBeenCalled();
  });

  it('rejects reserved usernames with 404 before any profile lookup', async () => {
    await expect(executeArtistPage('admin')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalled();
    expect(resolveOpaqueInternalProfileUsernameMock).not.toHaveBeenCalled();
    expect(getProfileAndLinksMock).not.toHaveBeenCalled();
  });

  it('404s opaque internal handles the resolver cannot map', async () => {
    resolveOpaqueInternalProfileUsernameMock.mockResolvedValue({
      action: 'not_found',
    });

    await expect(executeArtistPage('a1x2y3z4w5v6u7')).rejects.toThrow(
      'NEXT_NOT_FOUND'
    );
    expect(getProfileAndLinksMock).not.toHaveBeenCalled();
  });

  it('permanently redirects opaque internal handles that resolve to a canonical handle', async () => {
    resolveOpaqueInternalProfileUsernameMock.mockResolvedValue({
      action: 'redirect',
      handle: 'realartist',
    });

    await expect(executeArtistPage('a1x2y3z4w5v6u7')).rejects.toThrow(
      'NEXT_REDIRECT'
    );
    expect(permanentRedirectMock).toHaveBeenCalledWith('/realartist');
    expect(getProfileAndLinksMock).not.toHaveBeenCalled();
  });

  it('404s missing profiles before the streamed Suspense boundary', async () => {
    getProfileAndLinksMock.mockResolvedValue(NOT_FOUND_RESULT);

    await expect(executeArtistPage('ghost')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalled();
  });

  it('renders the transient error recovery state instead of a 500 when the profile read fails', async () => {
    getProfileAndLinksMock.mockResolvedValue(ERROR_RESULT);

    const html = await renderArtistPageContent('testartist');

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(html).toContain('public-profile-error');
    expect(html).toContain('Profile Is Temporarily Unavailable');
    // Retry targets the lowercased handle so the next attempt re-enters the
    // canonical public route.
    expect(html).toContain('href="/testartist"');
  });

  it('degrades secondary read failures instead of failing the render', async () => {
    getPublicTourDatesMock.mockRejectedValue(new Error('tour db down'));
    getReleasesForProfileLiteMock.mockRejectedValue(new Error('catalog down'));

    const html = await renderArtistPageContent('testartist');

    expect(html).toContain('static-artist-page');
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('renders the dedicated client surface for the unfazed handle', async () => {
    const pageTree = await executeArtistPage('unfazed');
    // The Unfazed branch returns its client element before the Suspense
    // boundary, so the tree is the Unfazed element itself.
    const html = renderToStaticMarkup(pageTree);

    expect(getProfileAndLinksMock).not.toHaveBeenCalled();
    expect(html).toContain('unfazed-client');
  });

  it('passes the claimed handle through to the loader unchanged', async () => {
    await renderArtistPageContent('TestArtist');

    expect(getProfileAndLinksMock).toHaveBeenCalledWith('TestArtist');
  });

  it('schedules collaborator reconciliation after a successful render', async () => {
    await renderArtistPageContent('testartist');

    expect(
      schedulePublicCollaboratorProfileReconciliationMock
    ).toHaveBeenCalledWith(
      expect.objectContaining({ creatorProfileId: 'profile-1' })
    );
  });
});

describe('public profile generateMetadata behavior (JOV-5778)', () => {
  async function generateMetadataFor(username: string) {
    return generateMetadata({ params: Promise.resolve({ username }) });
  }

  it('builds canonical public metadata for a public profile', async () => {
    const metadata = await generateMetadataFor('testartist');

    expect(metadata.title).toContain('Test Artist');
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('404s missing profiles instead of synthesizing metadata', async () => {
    getProfileAndLinksMock.mockResolvedValue(NOT_FOUND_RESULT);

    await expect(generateMetadataFor('ghost')).rejects.toThrow(
      'NEXT_NOT_FOUND'
    );
  });

  it('returns the error metadata contract when the profile read fails', async () => {
    getProfileAndLinksMock.mockResolvedValue(ERROR_RESULT);

    const metadata = await generateMetadataFor('testartist');

    // PROFILE_ERROR_METADATA keeps crawlers away from transient failures.
    expect(metadata.title).toBe('Profile temporarily unavailable');
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('noindexes the unfazed special-case handle', async () => {
    const metadata = await generateMetadataFor('unfazed');

    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(getProfileAndLinksMock).not.toHaveBeenCalled();
  });

  it('noindexes a public profile with no publicly eligible release (JOV-6611)', async () => {
    getProfileAndLinksMock.mockResolvedValue(EMPTY_CATALOG_RESULT);

    const metadata = await generateMetadataFor('testartist');

    expect(metadata.robots).toEqual({
      index: false,
      follow: false,
      googleBot: { index: false, follow: false },
    });
  });
});
