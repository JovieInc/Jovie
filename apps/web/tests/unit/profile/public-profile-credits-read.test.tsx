/**
 * The public profile page reads the latest release's credits in the same
 * batch as its other secondary reads, not in a serial await ahead of them.
 * Executes the real `app/[username]/page.tsx` content with reads mocked at
 * their boundaries (same convention as public-profile-page-route.test.tsx).
 */

import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicProfileLoaderResult } from '@/app/[username]/_lib/public-profile-loader';
import ArtistPage from '@/app/[username]/page';

const mocks = vi.hoisted(() => ({
  getProfileAndLinks: vi.fn(),
  loadPublicReleaseCredits: vi.fn(),
  getProfileAlertOptInVariant: vi.fn(),
  getProfilePacAssignment: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  permanentRedirect: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fetcher: () => Promise<unknown>) => () => fetcher(),
}));
vi.mock('@/app/[username]/_lib/public-profile-loader', () => ({
  getProfileAndLinks: mocks.getProfileAndLinks,
}));
vi.mock('@/lib/profile/opaque-internal-profile-handle.server', () => ({
  resolveOpaqueInternalProfileUsername: async () => ({ action: 'serve' }),
}));
vi.mock('@/lib/tour-dates/queries', () => ({
  getUpcomingTourDatesForProfile: async () => [],
}));
vi.mock('@/lib/discography/queries', () => ({
  getReleasesForProfileLite: async () => [],
}));
vi.mock('@/lib/releases/public-release-loader', () => ({
  getCachedPublicReleasesForProfile: async () => [],
}));
vi.mock('@/app/[username]/[slug]/_lib/data', () => ({
  loadPublicReleaseCredits: mocks.loadPublicReleaseCredits,
}));
vi.mock('@/lib/merch/service', () => ({
  getLiveMerchCardsForProfile: async () => [],
}));
vi.mock('@/lib/discography/artist-queries', () => ({
  getCreditedArtistsWithProfiles: async () => [],
  getStructuredReleaseCollaborators: async () => [],
}));
vi.mock('@/lib/entity/queries', () => ({
  getEntityIdentityLinks: async () => [],
}));
vi.mock('@/lib/flags/profile-variant', () => ({
  getMerchMvpEnabled: async () => false,
  getProfileAlertOptInVariant: mocks.getProfileAlertOptInVariant,
  getProfilePacAssignment: mocks.getProfilePacAssignment,
}));
vi.mock('@/lib/profile/public-collaborator-reconciliation', () => ({
  schedulePublicCollaboratorProfileReconciliation: vi.fn(),
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

const PROFILE_RESULT = {
  profile: {
    id: 'profile-1',
    user_id: 'user-1',
    creator_type: 'artist',
    username: 'testartist',
    username_normalized: 'testartist',
    display_name: 'Test Artist',
    bio: 'bio',
    avatar_url: null,
    spotify_url: 'https://open.spotify.com/artist/123',
    spotify_id: 'spotify-123',
    is_public: true,
    is_claimed: true,
    settings: {},
    theme: {},
  },
  links: [],
  contacts: [],
  creatorIsPro: false,
  creatorClerkId: 'user-1',
  creatorMetaPixelId: null,
  genres: ['house'],
  latestRelease: { id: 'release-1', title: 'Latest Track', slug: 'latest' },
  pressPhotos: [],
  status: 'ok',
} as unknown as PublicProfileLoaderResult;

/** Await the page, then execute its async content component (not rendered). */
async function runProfileContent(): Promise<ReactNode> {
  const child = (await ArtistPage({
    params: Promise.resolve({ username: 'testartist' }),
  })) as ReactElement<
    Record<string, unknown>,
    (props: Record<string, unknown>) => Promise<ReactNode>
  >;
  return child.type(child.props);
}

describe('public profile latest-release credits read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProfileAndLinks.mockResolvedValue(PROFILE_RESULT);
    mocks.loadPublicReleaseCredits.mockResolvedValue([]);
    mocks.getProfileAlertOptInVariant.mockResolvedValue('button');
    mocks.getProfilePacAssignment.mockResolvedValue('control');
  });

  it('starts the batched reads while the credits read is still pending', async () => {
    let resolveCredits: (credits: never[]) => void = () => {};
    mocks.loadPublicReleaseCredits.mockReturnValue(
      new Promise<never[]>(resolve => {
        resolveCredits = resolve;
      })
    );

    const pending = runProfileContent();

    // These two reads only start inside the page's final Promise.all. Seeing
    // them while credits are unresolved proves credits no longer hold it back.
    await vi.waitFor(() => {
      expect(mocks.getProfileAlertOptInVariant).toHaveBeenCalled();
      expect(mocks.getProfilePacAssignment).toHaveBeenCalled();
    });
    expect(mocks.loadPublicReleaseCredits).toHaveBeenCalledWith('release-1');

    resolveCredits([]);
    await expect(pending).resolves.toBeTruthy();
  });

  it('still resolves the profile when the credits read fails', async () => {
    mocks.loadPublicReleaseCredits.mockRejectedValue(new Error('db down'));

    await expect(runProfileContent()).resolves.toBeTruthy();
    expect(mocks.loadPublicReleaseCredits).toHaveBeenCalledWith('release-1');
  });

  it('skips the credits read when there is no latest release', async () => {
    mocks.getProfileAndLinks.mockResolvedValue({
      ...PROFILE_RESULT,
      latestRelease: null,
    });

    await expect(runProfileContent()).resolves.toBeTruthy();
    expect(mocks.loadPublicReleaseCredits).not.toHaveBeenCalled();
  });
});
