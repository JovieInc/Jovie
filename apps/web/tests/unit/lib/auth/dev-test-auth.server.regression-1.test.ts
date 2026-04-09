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

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
  },
}));

describe('dev-test-auth.server regression coverage', () => {
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

  it('keeps the creator persona incomplete so local auth still routes to onboarding', async () => {
    // Regression: ISSUE-001 — creator persona was incorrectly marked onboarding-complete
    // Found by /qa on 2026-04-08
    // Report: .gstack/qa-reports/qa-report-127-0-0-1-2026-04-08.md
    const { ensureDevTestAuthActor } = await import(
      '@/lib/auth/dev-test-auth.server'
    );

    await ensureDevTestAuthActor('creator');

    expect(mockEnsureCreatorProfileRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        username: 'browse-test-user',
        isPublic: false,
        onboardingCompletedAt: null,
      })
    );
  });
});
