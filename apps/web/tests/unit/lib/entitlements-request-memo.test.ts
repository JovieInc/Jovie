import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCachedAuth,
  mockCachedCurrentUser,
  mockGetUserBillingInfo,
  mockIsAdmin,
} = vi.hoisted(() => ({
  mockCachedAuth: vi.fn(),
  mockCachedCurrentUser: vi.fn(),
  mockGetUserBillingInfo: vi.fn(),
  mockIsAdmin: vi.fn(),
}));

// React's render cache keys on argument identity. Model that so the test
// proves the entitlements cache key is a primitive, not an options object.
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
      const results = new Map<unknown, R>();
      return (...args: A): R => {
        const key = args[0];
        if (!results.has(key)) results.set(key, fn(...args));
        return results.get(key) as R;
      };
    },
  };
});

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockCachedAuth,
  getCachedCurrentUser: mockCachedCurrentUser,
}));

vi.mock('@/lib/stripe/customer-sync', () => ({
  getUserBillingInfo: mockGetUserBillingInfo,
}));

vi.mock('@/lib/admin/mfa', () => ({
  hasRecentAdminMfaReverification: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/admin/roles', () => ({
  isAdmin: mockIsAdmin,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe('getCurrentUserEntitlements request memo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockCachedAuth.mockResolvedValue({ userId: 'user_1' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'a@example.com' },
    });
    mockIsAdmin.mockResolvedValue(false);
    mockGetUserBillingInfo.mockResolvedValue({ success: true, data: null });
  });

  it('resolves billing and admin role once for repeated cookie reads', async () => {
    const { getCurrentUserEntitlements } = await import(
      '@/lib/entitlements/server'
    );

    // Page, tasks gate, and dashboard loader in one /app/tasks render.
    const [page, gate, loader] = await Promise.all([
      getCurrentUserEntitlements(),
      getCurrentUserEntitlements({}),
      getCurrentUserEntitlements({ session: 'cookie' }),
    ]);

    expect(gate).toBe(page);
    expect(loader).toBe(page);
    expect(mockGetUserBillingInfo).toHaveBeenCalledTimes(1);
    expect(mockIsAdmin).toHaveBeenCalledTimes(1);
  });

  it('keeps fresh reads separate from cookie reads', async () => {
    const { getCurrentUserEntitlements } = await import(
      '@/lib/entitlements/server'
    );

    await getCurrentUserEntitlements();
    await getCurrentUserEntitlements({ session: 'fresh' });
    await getCurrentUserEntitlements({ session: 'fresh' });

    expect(mockGetUserBillingInfo).toHaveBeenCalledTimes(2);
    expect(mockCachedAuth).toHaveBeenCalledWith({ session: 'fresh' });
  });
});
