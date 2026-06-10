import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDbSelect, mockRedisGet, mockRedisSet, mockRedisDel, mockGetRedis } =
  vi.hoisted(() => ({
    mockDbSelect: vi.fn(),
    mockRedisGet: vi.fn(),
    mockRedisSet: vi.fn().mockResolvedValue('OK'),
    mockRedisDel: vi.fn().mockResolvedValue(1),
    mockGetRedis: vi.fn(),
  }));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    clerkId: 'clerkId',
    userStatus: 'userStatus',
    deletedAt: 'deletedAt',
  },
}));

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  getClient: vi.fn().mockReturnValue(null),
  withScope: vi.fn((cb: (scope: unknown) => void) =>
    cb({ setExtra: vi.fn(), setTag: vi.fn() })
  ),
}));

vi.mock('@/lib/sentry/init', () => ({
  getSentryMode: vi.fn().mockReturnValue('disabled'),
  isSentryInitialized: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/analytics/runtime-aware', () => ({
  trackEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/redis', () => ({
  getRedis: mockGetRedis,
}));

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  };
});

import * as Sentry from '@sentry/nextjs';
import {
  getUserBanStatus,
  invalidateBanStatusCache,
} from '@/lib/auth/ban-check';

function mockDbResult(result: unknown) {
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  });
}

describe('ban-check.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRedis.mockReturnValue({
      get: mockRedisGet,
      set: mockRedisSet,
      del: mockRedisDel,
    });
  });

  it('returns banned status from DB and writes Redis cache', async () => {
    mockDbResult([
      {
        userStatus: 'banned',
        deletedAt: null,
      },
    ]);

    const result = await getUserBanStatus('clerk_banned');

    expect(result).toEqual({ isBanned: true });
    expect(mockRedisSet).toHaveBeenCalledWith(
      'auth:ban-status:v1:clerk_banned',
      expect.objectContaining({ isBanned: true }),
      { ex: 300 }
    );
  });

  it('returns active status from DB and writes shorter Redis TTL', async () => {
    mockDbResult([
      {
        userStatus: 'active',
        deletedAt: null,
      },
    ]);

    const result = await getUserBanStatus('clerk_active');

    expect(result).toEqual({ isBanned: false });
    expect(mockRedisSet).toHaveBeenCalledWith(
      'auth:ban-status:v1:clerk_active',
      expect.objectContaining({ isBanned: false }),
      { ex: 120 }
    );
  });

  it('serves cached banned status when DB is unavailable', async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockRejectedValue(new Error('DB unavailable')),
        }),
      }),
    });
    mockRedisGet.mockResolvedValue({
      isBanned: true,
      cachedAt: '2026-06-10T00:00:00.000Z',
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await getUserBanStatus('clerk_banned');

    expect(result).toEqual({ isBanned: true });
    expect(mockRedisGet).toHaveBeenCalledWith(
      'auth:ban-status:v1:clerk_banned'
    );
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'ban-check',
        message: 'Served cached ban status after DB failure',
      })
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Ban status check used cached fallback')
    );

    consoleSpy.mockRestore();
  });

  it('fails open with telemetry when DB and cache are unavailable', async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockRejectedValue(new Error('DB unavailable')),
        }),
      }),
    });
    mockRedisGet.mockResolvedValue(null);

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await getUserBanStatus('clerk_unknown');

    expect(result).toEqual({ isBanned: false });
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'ban-check',
        message: 'Fail-open ban check',
      })
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Ban status check failed open after DB and cache miss'
      )
    );

    consoleSpy.mockRestore();
  });

  it('invalidates the Redis cache key', async () => {
    await invalidateBanStatusCache('clerk_123');

    expect(mockRedisDel).toHaveBeenCalledWith('auth:ban-status:v1:clerk_123');
  });
});
