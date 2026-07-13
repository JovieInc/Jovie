import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockEnsureBetterAuthTestUser,
  mockEnsureCreatorProfileRecord,
  mockEnsureUserProfileClaim,
  mockEnsureUserRecord,
  mockInvalidateTestUserCaches,
  mockSetActiveProfileForUser,
  mockEnsureSocialLinkRecord,
} = vi.hoisted(() => ({
  mockEnsureBetterAuthTestUser: vi.fn(),
  mockEnsureCreatorProfileRecord: vi.fn(),
  mockEnsureUserProfileClaim: vi.fn(),
  mockEnsureUserRecord: vi.fn(),
  mockInvalidateTestUserCaches: vi.fn(),
  mockSetActiveProfileForUser: vi.fn(),
  mockEnsureSocialLinkRecord: vi.fn(),
}));

vi.mock('@/lib/db', () => {
  const limit = vi
    .fn()
    .mockResolvedValue([{ id: 'db_user', betterAuthUserId: 'ba_user' }]);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const set = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
  const update = vi.fn(() => ({ set }));
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({ values }));
  return { db: { select, update, insert } };
});

vi.mock('@/lib/auth/better-auth', () => ({
  auth: {
    $context: Promise.resolve({
      internalAdapter: {
        createSession: vi.fn().mockResolvedValue({ id: 'sess' }),
      },
    }),
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => args),
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'id', betterAuthUserId: 'betterAuthUserId' },
}));

vi.mock('@/lib/db/schema/better-auth', () => ({
  baUsers: { id: 'id' },
}));

vi.mock('@/lib/testing/test-user-provision.server', () => ({
  DEFAULT_TEST_AVATAR_URL: '/avatars/default-user.png',
  ensureBetterAuthTestUser: mockEnsureBetterAuthTestUser,
  ensureCreatorProfileRecord: mockEnsureCreatorProfileRecord,
  ensureUserProfileClaim: mockEnsureUserProfileClaim,
  ensureUserRecord: mockEnsureUserRecord,
  invalidateTestUserCaches: mockInvalidateTestUserCaches,
  setActiveProfileForUser: mockSetActiveProfileForUser,
  ensureSocialLinkRecord: mockEnsureSocialLinkRecord,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

describe('dev-test-auth.server regression coverage (Better Auth)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockEnsureBetterAuthTestUser.mockResolvedValue('ba_user');
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
    const { ensureDevTestAuthActor } = await import(
      '@/lib/auth/dev-test-auth.server'
    );
    const actor = await ensureDevTestAuthActor('creator');

    expect(mockEnsureUserRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({
        plan: expect.anything(),
        isPro: true,
      })
    );
    expect(mockEnsureCreatorProfileRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        isClaimed: true,
        // incomplete onboarding for creator persona
        onboardingCompletedAt: null,
      })
    );
    expect(actor.persona).toBe('creator');
    expect(actor.clerkUserId).toBe('ba_user');
  }, 15_000);
});
