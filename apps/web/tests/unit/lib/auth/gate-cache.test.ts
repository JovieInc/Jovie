import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Request-cache coverage for resolveUserState under Better Auth.
 * React.cache is mocked to a real per-fn memo so we can assert dedupe.
 */

const {
  mockGetSession,
  mockGetCachedDevTestAuthSession,
  mockDbSelect,
  mockIsWaitlistGateEnabled,
  mockCheckUserStatus,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetCachedDevTestAuthSession: vi.fn(),
  mockDbSelect: vi.fn(),
  mockIsWaitlistGateEnabled: vi.fn().mockResolvedValue(false),
  mockCheckUserStatus: vi.fn().mockReturnValue({
    isBlocked: false,
    blockedState: null,
    redirectTo: null,
  }),
}));

const cacheStore = vi.hoisted(() => new Map<string, unknown>());

vi.mock('server-only', () => ({}));

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => {
      return ((...args: never[]) => {
        const key = JSON.stringify(args);
        if (!cacheStore.has(key)) {
          cacheStore.set(key, fn(...args));
        }
        return cacheStore.get(key);
      }) as T;
    },
  };
});

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock('@/lib/auth/better-auth', () => ({
  auth: { api: { getSession: mockGetSession } },
}));

vi.mock('@/lib/auth/dev-test-auth.server', () => ({
  getCachedDevTestAuthSession: mockGetCachedDevTestAuthSession,
}));

vi.mock('@/lib/db', () => ({
  db: { select: mockDbSelect, insert: vi.fn(), update: vi.fn() },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    id: 'users.id',
    betterAuthUserId: 'users.betterAuthUserId',
    email: 'users.email',
    userStatus: 'users.userStatus',
    isAdmin: 'users.isAdmin',
    isPro: 'users.isPro',
    deletedAt: 'users.deletedAt',
    activeProfileId: 'users.activeProfileId',
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'creatorProfiles.id',
    username: 'creatorProfiles.username',
    usernameNormalized: 'creatorProfiles.usernameNormalized',
    displayName: 'creatorProfiles.displayName',
    isPublic: 'creatorProfiles.isPublic',
    avatarUrl: 'creatorProfiles.avatarUrl',
    onboardingCompletedAt: 'creatorProfiles.onboardingCompletedAt',
  },
}));

vi.mock('@/lib/db/schema/waitlist', () => ({
  waitlistEntries: { id: 'id', email: 'email', status: 'status' },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
  captureCriticalError: vi.fn(),
}));

vi.mock('@/lib/utils/email', () => ({
  normalizeEmail: (e: string) => e?.toLowerCase().trim(),
}));

vi.mock('@/lib/auth/status-checker', () => ({
  checkUserStatus: mockCheckUserStatus,
}));

vi.mock('@/lib/waitlist/settings', () => ({
  isWaitlistGateEnabled: mockIsWaitlistGateEnabled,
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  sql: Object.assign((s: TemplateStringsArray, ...v: unknown[]) => ({ s, v }), {
    raw: vi.fn(),
  }),
  desc: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  getClient: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

import { resolveUserState } from '@/lib/auth/gate';

describe('resolveUserState request cache (Better Auth)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cacheStore.clear();
    mockGetCachedDevTestAuthSession.mockResolvedValue(null);
    mockIsWaitlistGateEnabled.mockResolvedValue(false);
    mockGetSession.mockResolvedValue(null);
  });

  it('deduplicates repeated resolveUserState calls within one request', async () => {
    mockGetSession.mockResolvedValue(null);

    const [a, b, c] = await Promise.all([
      resolveUserState(),
      resolveUserState(),
      resolveUserState(),
    ]);

    expect(a).toBe(b);
    expect(b).toBe(c);
    // session read once thanks to React.cache on the serialized options key
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });

  it('keeps separate cache entries for different option shapes', async () => {
    mockGetSession.mockResolvedValue(null);

    await resolveUserState();
    await resolveUserState({ createDbUserIfMissing: false });

    // Different serialize keys → two cache entries → two session reads.
    expect(mockGetSession).toHaveBeenCalledTimes(2);
  });
});
