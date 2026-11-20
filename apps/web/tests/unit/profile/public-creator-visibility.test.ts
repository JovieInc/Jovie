import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  select: vi.fn(),
  pixel: vi.fn(),
  authority: vi.fn(),
  cache: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('react', () => ({ cache: (fn: unknown) => fn }));
vi.mock('next/cache', () => ({ unstable_cache: mocks.cache }));
vi.mock('@/lib/services/profile', () => ({
  getProfileWithLinks: mocks.profile,
}));
vi.mock('@/lib/db', () => ({ db: { select: mocks.select } }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import { getProfileAndLinks } from '@/app/[username]/_lib/public-profile-loader';
import { getProfileVisitorState } from '@/lib/claim/visitor-state';
import { resolveEffectivePlan } from '@/lib/entitlements/creator-plan';
import { isCreatorRowPubliclyVisible } from '@/lib/profile/public-creator-visibility.server';

describe('public creator visibility, Better Auth ownership, and trial pixel expiry', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '');
    mocks.cache.mockImplementation((fn: () => unknown) => fn);
    mocks.pixel.mockResolvedValue([{ facebookPixelId: '123456789' }]);
    mocks.select.mockImplementation((columns: Record<string, unknown>) => {
      const limit = 'isPublic' in columns ? mocks.authority : mocks.pixel;
      const where = () => ({ limit });
      return { from: () => ({ where, leftJoin: () => ({ where }) }) };
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('rejects private and test-owned profiles including userId === null test handles', () => {
    expect(
      isCreatorRowPubliclyVisible({
        handle: 'realartist',
        isPublic: false,
        ownerEmail: 'artist@example.com',
        settings: {},
      })
    ).toBe(false);

    expect(
      isCreatorRowPubliclyVisible({
        handle: 'gp-test-handle',
        isPublic: true,
        ownerEmail: null,
        settings: { isSyntheticTestProfile: true },
      })
    ).toBe(false);

    expect(
      isCreatorRowPubliclyVisible({
        handle: 'tmoc9o49ccvw8mlg',
        isPublic: true,
        ownerEmail: null,
        settings: {},
      })
    ).toBe(false);

    expect(
      isCreatorRowPubliclyVisible({
        handle: 'realartist',
        isPublic: true,
        ownerEmail: 'artist@gmail.com',
        settings: {},
      })
    ).toBe(true);
  });

  it('resolves Better Auth owner and claimed_public visitor states when userClerkId is null', () => {
    expect(
      getProfileVisitorState({
        profile: {
          id: 'profile-ba',
          username: 'baartist',
          isClaimed: true,
          userId: 'ba-uuid-1',
          userClerkId: null,
          spotifyId: 'spotify_1',
        },
        authUserId: 'ba-uuid-1',
        pendingClaimContext: null,
      })
    ).toBe('owner');

    expect(
      getProfileVisitorState({
        profile: {
          id: 'profile-ba',
          username: 'baartist',
          isClaimed: true,
          userId: 'ba-uuid-1',
          userClerkId: null,
          spotifyId: 'spotify_1',
        },
        authUserId: null,
        pendingClaimContext: null,
      })
    ).toBe('claimed_public');
  });

  it('blocks ad pixels when plan is trial with an expired or missing trialEndsAt', async () => {
    const expired = new Date(Date.now() - 60_000);
    const active = new Date(Date.now() + 86_400_000);

    expect(resolveEffectivePlan('trial', null)).toBe('free');
    expect(resolveEffectivePlan('trial', expired)).toBe('free');
    expect(resolveEffectivePlan('trial', active)).toBe('trial');

    mocks.profile.mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      username: 'testartist',
      usernameNormalized: 'testartist',
      displayName: 'Test Artist',
      creatorType: 'artist',
      isPublic: true,
      isClaimed: true,
      avatarUrl: null,
      userEmail: 'artist@gmail.com',
      userPlan: 'trial',
      userTrialEndsAt: expired,
      userIsPro: false,
      userClerkId: null,
      spotifyUrl: null,
      settings: {},
      theme: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      socialLinks: [],
    });

    const expiredResult = await getProfileAndLinks('testartist');
    expect(expiredResult.status).toBe('ok');
    expect(expiredResult.creatorMetaPixelId).toBeNull();
    expect(expiredResult.profile?.is_claimed).toBe(true);

    mocks.profile.mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      username: 'testartist',
      usernameNormalized: 'testartist',
      displayName: 'Test Artist',
      creatorType: 'artist',
      isPublic: true,
      isClaimed: true,
      avatarUrl: null,
      userEmail: 'artist@gmail.com',
      userPlan: 'trial',
      userTrialEndsAt: active,
      userIsPro: false,
      userClerkId: null,
      spotifyUrl: null,
      settings: {},
      theme: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      socialLinks: [],
    });

    const activeResult = await getProfileAndLinks('testartist');
    expect(activeResult.creatorMetaPixelId).toBe('123456789');
  });
});
