import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockEnsureClerkTestUser,
  mockEnsureCreatorProfileRecord,
  mockEnsureSocialLinkRecord,
  mockEnsureUserProfileClaim,
  mockEnsureUserRecord,
  mockInvalidateTestUserCaches,
  mockSetActiveProfileForUser,
} = vi.hoisted(() => ({
  mockEnsureClerkTestUser: vi.fn(),
  mockEnsureCreatorProfileRecord: vi.fn(),
  mockEnsureSocialLinkRecord: vi.fn(),
  mockEnsureUserProfileClaim: vi.fn(),
  mockEnsureUserRecord: vi.fn(),
  mockInvalidateTestUserCaches: vi.fn(),
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

  it('rejects non-loopback and non-private hosts', async () => {
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');
    const { getDevTestAuthAvailability } = await import(
      '@/lib/auth/dev-test-auth.server'
    );

    expect(getDevTestAuthAvailability('preview.jov.ie')).toEqual({
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

  it('prefers explicit admin credentials and skips creator-profile provisioning for admin', async () => {
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
    expect(mockEnsureCreatorProfileRecord).not.toHaveBeenCalled();
    expect(mockEnsureUserProfileClaim).not.toHaveBeenCalled();
    expect(mockSetActiveProfileForUser).not.toHaveBeenCalled();
    expect(actor).toEqual({
      persona: 'admin',
      clerkUserId: 'user_clerk',
      email: 'admin+clerk_test@jov.ie',
      username: 'browse-admin-user',
      fullName: 'Browse Admin',
      isAdmin: true,
      profilePath: null,
    });
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
