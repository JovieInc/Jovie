import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockEnsureClerkTestUser,
  mockEnsureBetterAuthTestUser,
  mockEnsureCreatorProfileRecord,
  mockEnsureSocialLinkRecord,
  mockEnsureUserProfileClaim,
  mockEnsureUserRecord,
  mockInvalidateTestUserCaches,
  mockDbLimit,
  mockCreateSession,
  mockLoggerWarn,
  mockSetActiveProfileForUser,
} = vi.hoisted(() => ({
  mockEnsureClerkTestUser: vi.fn(),
  mockEnsureBetterAuthTestUser: vi.fn(),
  mockEnsureCreatorProfileRecord: vi.fn(),
  mockEnsureSocialLinkRecord: vi.fn(),
  mockEnsureUserProfileClaim: vi.fn(),
  mockEnsureUserRecord: vi.fn(),
  mockInvalidateTestUserCaches: vi.fn(),
  mockDbLimit: vi.fn(),
  mockCreateSession: vi.fn().mockResolvedValue({ id: 'sess_test' }),
  mockLoggerWarn: vi.fn(),
  mockSetActiveProfileForUser: vi.fn(),
}));

vi.mock('@/lib/db', () => {
  const limit = mockDbLimit;
  const where = vi.fn(() => ({
    limit,
    where: vi.fn().mockResolvedValue(undefined),
  }));
  const from = vi.fn(() => ({
    where,
    leftJoin: vi.fn(() => ({ where })),
  }));
  const select = vi.fn(() => ({ from }));
  const set = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
  const update = vi.fn(() => ({ set }));
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({ values }));
  return {
    db: { select, update, insert },
  };
});

vi.mock('@/lib/auth/better-auth', () => ({
  auth: {
    $context: Promise.resolve({
      internalAdapter: {
        createSession: mockCreateSession,
      },
    }),
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => args),
  or: vi.fn((...args: unknown[]) => args),
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    id: 'id',
    betterAuthUserId: 'betterAuthUserId',
    clerkId: 'clerkId',
  },
}));

vi.mock('@/lib/db/schema/better-auth', () => ({
  baUsers: { id: 'id' },
}));

vi.mock('@/lib/testing/test-user-provision.server', () => ({
  DEFAULT_TEST_AVATAR_URL: '/avatars/default-user.png',
  ensureClerkTestUser: mockEnsureClerkTestUser,
  ensureBetterAuthTestUser: mockEnsureBetterAuthTestUser,
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
    mockEnsureBetterAuthTestUser.mockResolvedValue('ba_user_clerk');
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
    mockDbLimit.mockResolvedValue([
      {
        dbUserId: 'db_user',
        clerkUserId: 'user_dev_existing',
        betterAuthUserId: 'ba_user_clerk',
        email: 'existing@test.jovie.com',
        fullName: 'Existing User',
        isAdmin: false,
        username: 'existing-user',
        displayName: 'Existing User',
      },
    ]);
  });

  it('mints a session for a direct persisted Better Auth actor id', async () => {
    const { ensureExistingDevTestAuthActor } = await import(
      '@/lib/auth/dev-test-auth.server'
    );

    await expect(
      ensureExistingDevTestAuthActor('ba_user_clerk', null)
    ).resolves.toMatchObject({
      dbUserId: 'db_user',
      clerkUserId: 'ba_user_clerk',
    });
  });

  it('resolves a legacy Clerk actor id to its linked persisted Better Auth actor', async () => {
    const { ensureExistingDevTestAuthActor } = await import(
      '@/lib/auth/dev-test-auth.server'
    );

    await expect(
      ensureExistingDevTestAuthActor('user_dev_existing', null)
    ).resolves.toMatchObject({
      dbUserId: 'db_user',
      clerkUserId: 'ba_user_clerk',
    });
    expect(mockCreateSession).toHaveBeenCalledWith('ba_user_clerk', false);
  });

  it('fails closed when a Clerk actor has no linked Better Auth identity', async () => {
    mockDbLimit.mockResolvedValueOnce([
      {
        dbUserId: 'db_user',
        clerkUserId: 'user_dev_unlinked',
        betterAuthUserId: null,
        email: 'unlinked@test.jovie.com',
        fullName: 'Unlinked User',
        isAdmin: false,
        username: 'unlinked-user',
        displayName: 'Unlinked User',
      },
    ]);
    const { ensureExistingDevTestAuthActor } = await import(
      '@/lib/auth/dev-test-auth.server'
    );

    await expect(
      ensureExistingDevTestAuthActor('user_dev_unlinked', null)
    ).resolves.toBeNull();
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('fails closed when no persisted actor matches either identity id', async () => {
    const { ensureExistingDevTestAuthActor } = await import(
      '@/lib/auth/dev-test-auth.server'
    );

    mockDbLimit.mockResolvedValueOnce([]);
    await expect(
      ensureExistingDevTestAuthActor('unknown-user', null)
    ).resolves.toBeNull();
  });

  it('enables local browse auth on trusted hosts when bypass mode is enabled', async () => {
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', 'development');
    const { getDevTestAuthAvailability } = await import(
      '@/lib/auth/dev-test-auth.server'
    );

    expect(getDevTestAuthAvailability('localhost')).toEqual({
      enabled: true,
      trustedHost: true,
      reason: null,
    });
  }, 15_000);

  it('rejects trusted preview hosts outside explicit development', async () => {
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');
    const { getDevTestAuthAvailability } = await import(
      '@/lib/auth/dev-test-auth.server'
    );

    expect(getDevTestAuthAvailability('preview.jov.ie')).toEqual({
      enabled: false,
      trustedHost: false,
      reason: 'Not available outside development',
    });
  });

  it('rejects wildcard Vercel hosts even in development bypass mode', async () => {
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');
    vi.stubEnv('NODE_ENV', 'development');
    const { getDevTestAuthAvailability } = await import(
      '@/lib/auth/dev-test-auth.server'
    );

    expect(
      getDevTestAuthAvailability('jovie-git-feature-123-jovie.vercel.app')
    ).toEqual({
      enabled: true,
      trustedHost: false,
      reason: 'Only available on loopback and private dev hosts',
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
      reason: 'Not available outside development',
    });
  });

  it('enables loopback automation for production-built CI test servers', async () => {
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VERCEL_ENV', '');
    const { getDevTestAuthAvailability } = await import(
      '@/lib/auth/dev-test-auth.server'
    );

    expect(getDevTestAuthAvailability('127.0.0.1')).toEqual({
      enabled: true,
      trustedHost: true,
      reason: null,
    });
  });

  it('rejects preview deployments even when the bypass env is enabled', async () => {
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');
    const { getDevTestAuthAvailability } = await import(
      '@/lib/auth/dev-test-auth.server'
    );

    expect(getDevTestAuthAvailability('preview.jov.ie')).toEqual({
      enabled: false,
      trustedHost: false,
      reason: 'Not available outside development',
    });
  });

  it('ignores spoofed x-vercel-env header for production guard (only real process.env is honored)', async () => {
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', 'development');
    const { getDevTestAuthAvailability } = await import(
      '@/lib/auth/dev-test-auth.server'
    );

    // Spoofed headers (e.g. x-vercel-env in request) have no effect —
    // the production check reads process.env only (defence in depth per register).
    expect(getDevTestAuthAvailability('localhost')).toEqual({
      enabled: true,
      trustedHost: true,
      reason: null,
    });
  });

  it('provisions the creator persona with a claimed profile baseline', async () => {
    const { ensureDevTestAuthActor } = await import(
      '@/lib/auth/dev-test-auth.server'
    );
    const actor = await ensureDevTestAuthActor('creator');

    expect(mockEnsureBetterAuthTestUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'browse+clerk_test@jov.ie',
        fullName: 'Browse Test User',
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
      clerkUserId: 'ba_user_clerk',
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

    expect(mockEnsureBetterAuthTestUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'browse-ready+clerk_test@jov.ie',
        fullName: 'Browse Ready User',
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
      clerkUserId: 'ba_user_clerk',
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

    expect(mockEnsureBetterAuthTestUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'admin+clerk_test@jov.ie',
        fullName: 'Browse Admin',
      })
    );
    expect(mockEnsureUserRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        isAdmin: true,
        plan: 'max',
        isPro: true,
        billingUpdatedAt: expect.any(Date),
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
      clerkUserId: 'ba_user_clerk',
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

    expect(mockEnsureBetterAuthTestUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'browse-admin+clerk_test@jov.ie',
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
      clerkUserId: 'ba_user_clerk',
      email: 'browse+clerk_test@jov.ie',
      username: 'browse-test-user',
      fullName: 'Browse Test User',
      isAdmin: false,
      profilePath: '/browse-test-user',
    });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Failed to invalidate dev test auth caches',
      expect.objectContaining({
        betterAuthUserId: 'ba_user_clerk',
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
