import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockEnsureClerkTestUser,
  mockEnsureCreatorProfileRecord,
  mockEnsureSocialLinkRecord,
  mockEnsureUserProfileClaim,
  mockEnsureUserRecord,
  mockInvalidateTestUserCaches,
  mockLoggerWarn,
  mockSetActiveProfileForUser,
} = vi.hoisted(() => ({
  mockEnsureClerkTestUser: vi.fn(),
  mockEnsureCreatorProfileRecord: vi.fn(),
  mockEnsureSocialLinkRecord: vi.fn(),
  mockEnsureUserProfileClaim: vi.fn(),
  mockEnsureUserRecord: vi.fn(),
  mockInvalidateTestUserCaches: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockSetActiveProfileForUser: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {},
}));

vi.mock('@/lib/testing/test-user-provision.server', () => ({
  DEFAULT_TEST_AVATAR_URL: '/avatars/default-user.png',
  ensureClerkTestUser: mockEnsureClerkTestUser,
  ensureCreatorProfileRecord: mockEnsureCreatorProfileRecord,
  ensureSocialLinkRecord: mockEnsureSocialLinkRecord,
  ensureUserProfileClaim: mockEnsureUserProfileClaim,
  ensureUserRecord: mockEnsureUserRecord,
  invalidateTestUserCaches: mockInvalidateTestUserCaches,
  setActiveProfileForUser: mockSetActiveProfileForUser,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: mockLoggerWarn,
  },
}));

describe('dev-test-auth.server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();

    mockEnsureClerkTestUser.mockResolvedValue('user_clerk');
    mockEnsureUserRecord.mockResolvedValue({
      id: 'db_user',
      previousClerkId: null,
    });
    mockEnsureCreatorProfileRecord.mockResolvedValue('profile_1');
    mockInvalidateTestUserCaches.mockResolvedValue(undefined);
    mockLoggerWarn.mockReset();
    mockEnsureUserProfileClaim.mockResolvedValue(undefined);
    mockSetActiveProfileForUser.mockResolvedValue(undefined);
    mockEnsureSocialLinkRecord.mockResolvedValue(undefined);
  });

  it('enables local browse auth on trusted hosts when bypass mode is enabled', async () => {
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');
    const { getDevTestAuthAvailability } = await import(
      '@/lib/auth/dev-test-auth.server'
    );

    expect(getDevTestAuthAvailability('localhost')).toEqual({
      enabled: true,
      trustedHost: true,
      reason: null,
    });
  });

  it('allows trusted preview hosts when bypass mode is enabled', async () => {
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');
    const { getDevTestAuthAvailability } = await import(
      '@/lib/auth/dev-test-auth.server'
    );

    expect(getDevTestAuthAvailability('preview.jov.ie')).toEqual({
      enabled: true,
      trustedHost: true,
      reason: null,
    });
    expect(
      getDevTestAuthAvailability('jovie-git-feature-123-jovie.vercel.app')
    ).toEqual({
      enabled: true,
      trustedHost: true,
      reason: null,
    });
  });

  it('rejects production even if the bypass env is enabled', async () => {
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    const { getDevTestAuthAvailability } = await import(
      '@/lib/auth/dev-test-auth.server'
    );

    expect(getDevTestAuthAvailability('localhost')).toEqual({
      enabled: false,
      trustedHost: false,
      reason: 'Not available in production',
    });
  });

  it('provisions the creator persona with a claimed profile baseline', async () => {
    const { ensureDevTestAuthActor } = await import(
      '@/lib/auth/dev-test-auth.server'
    );
    const actor = await ensureDevTestAuthActor('creator');

    expect(mockEnsureClerkTestUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'browse+clerk_test@jov.ie',
        username: 'browse-test-user',
      })
    );
    expect(mockEnsureUserRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({
        plan: expect.anything(),
        isPro: expect.anything(),
      })
    );
    expect(mockEnsureCreatorProfileRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        username: 'browse-test-user',
        venmoHandle: 'browse-test-user',
        isClaimed: true,
      })
    );
    expect(mockEnsureUserProfileClaim).toHaveBeenCalledWith(
      expect.anything(),
      'db_user',
      'profile_1'
    );
    expect(mockSetActiveProfileForUser).toHaveBeenCalledWith(
      expect.anything(),
      'db_user',
      'profile_1'
    );
    expect(mockEnsureSocialLinkRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        platform: 'venmo',
        url: 'https://venmo.com/browse-test-user',
      })
    );
    expect(actor).toEqual({
      persona: 'creator',
      clerkUserId: 'user_clerk',
      email: 'browse+clerk_test@jov.ie',
      username: 'browse-test-user',
      fullName: 'Browse Test User',
      isAdmin: false,
      profilePath: '/browse-test-user',
    });
  });

  it('provisions the ready creator persona with a publishable profile baseline', async () => {
    const { ensureDevTestAuthActor } = await import(
      '@/lib/auth/dev-test-auth.server'
    );
    const actor = await ensureDevTestAuthActor('creator-ready');

    expect(mockEnsureClerkTestUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'browse-ready+clerk_test@jov.ie',
        username: 'browse-ready-user',
      })
    );
    expect(mockEnsureUserRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        plan: 'pro',
        isPro: true,
        billingUpdatedAt: expect.any(Date),
      })
    );
    expect(mockEnsureCreatorProfileRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        username: 'browse-ready-user',
        spotifyUrl: 'https://open.spotify.com/artist/4NHQUkpP4uKj7LKEMstSxN',
        venmoHandle: 'browse-ready-user',
        isClaimed: true,
      })
    );
    expect(mockEnsureSocialLinkRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        platform: 'venmo',
        url: 'https://venmo.com/browse-ready-user',
      })
    );
    expect(actor).toEqual({
      persona: 'creator-ready',
      clerkUserId: 'user_clerk',
      email: 'browse-ready+clerk_test@jov.ie',
      username: 'browse-ready-user',
      fullName: 'Browse Ready User',
      isAdmin: false,
      profilePath: '/browse-ready-user',
    });
  });

  it('prefers explicit admin credentials and provisions an admin profile', async () => {
    vi.stubEnv('E2E_CLERK_ADMIN_USERNAME', 'admin+clerk_test@jov.ie');
    const { ensureDevTestAuthActor } = await import(
      '@/lib/auth/dev-test-auth.server'
    );
    const actor = await ensureDevTestAuthActor('admin');

    expect(mockEnsureClerkTestUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'admin+clerk_test@jov.ie',
        username: 'browse-admin-user',
      })
    );
    expect(mockEnsureCreatorProfileRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        username: 'browse-admin-user',
        usernameNormalized: 'browse-admin-user',
        bio: 'Stable admin profile for local perf checks and admin-shell QA.',
        venmoHandle: 'browse-admin-user',
        isPublic: false,
        isClaimed: true,
      })
    );
    expect(mockEnsureUserProfileClaim).toHaveBeenCalledWith(
      expect.anything(),
      'db_user',
      'profile_1'
    );
    expect(mockSetActiveProfileForUser).toHaveBeenCalledWith(
      expect.anything(),
      'db_user',
      'profile_1'
    );
    expect(mockEnsureSocialLinkRecord).not.toHaveBeenCalled();
    expect(actor).toEqual({
      persona: 'admin',
      clerkUserId: 'user_clerk',
      email: 'admin+clerk_test@jov.ie',
      username: 'browse-admin-user',
      fullName: 'Browse Admin',
      isAdmin: true,
      profilePath: '/browse-admin-user',
    });
  });

  it('keeps the admin persona distinct from creator env defaults', async () => {
    vi.stubEnv('E2E_CLERK_USER_USERNAME', 'creator+clerk_test@jov.ie');
    vi.stubEnv('E2E_CLERK_ADMIN_ID', 'user_admin_seed');
    const { ensureDevTestAuthActor } = await import(
      '@/lib/auth/dev-test-auth.server'
    );

    await ensureDevTestAuthActor('admin');

    expect(mockEnsureClerkTestUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'browse-admin+clerk_test@jov.ie',
        fallbackClerkId: 'user_admin_seed',
      })
    );
  });

  it('does not fall back to the stable persona username for matched users without an active profile', async () => {
    const { buildDevTestAuthCurrentUser } = await import(
      '@/lib/auth/dev-test-auth.server'
    );

    const currentUser = buildDevTestAuthCurrentUser({
      persona: 'creator',
      clerkUserId: 'user_clerk',
      dbUserId: 'db_user',
      email: 'browse+clerk_test@jov.ie',
      username: null,
      fullName: 'Browse Test User',
      isAdmin: false,
      profilePath: null,
    });

    expect(currentUser.username).toBeNull();
  });

  it('does not fail bootstrap when cache invalidation fails', async () => {
    mockInvalidateTestUserCaches.mockRejectedValue(
      new Error('redis unavailable')
    );

    const { ensureDevTestAuthActor } = await import(
      '@/lib/auth/dev-test-auth.server'
    );

    await expect(ensureDevTestAuthActor('creator')).resolves.toEqual({
      persona: 'creator',
      clerkUserId: 'user_clerk',
      email: 'browse+clerk_test@jov.ie',
      username: 'browse-test-user',
      fullName: 'Browse Test User',
      isAdmin: false,
      profilePath: '/browse-test-user',
    });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Failed to invalidate dev test auth caches',
      expect.objectContaining({
        clerkUserId: 'user_clerk',
      }),
      'dev-test-auth'
    );
  });

  it('rejects unsafe redirect targets and preserves app-relative ones', async () => {
    const { sanitizeDevTestAuthRedirectPath } = await import(
      '@/lib/auth/dev-test-auth.server'
    );

    expect(sanitizeDevTestAuthRedirectPath('/app/dashboard/earnings')).toBe(
      '/app/dashboard/earnings'
    );
    expect(sanitizeDevTestAuthRedirectPath('https://evil.example')).toBeNull();
    expect(sanitizeDevTestAuthRedirectPath('//evil.example')).toBeNull();
  });
});
