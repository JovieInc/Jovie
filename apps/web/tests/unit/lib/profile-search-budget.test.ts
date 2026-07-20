import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

let nodeEnv = 'test';
let vercelEnv: string | undefined;
vi.mock('@/lib/env-server', () => ({
  env: {
    get NODE_ENV() {
      return nodeEnv;
    },
    get VERCEL_ENV() {
      return vercelEnv;
    },
  },
}));

const mockGetRedis = vi.fn();
vi.mock('@/lib/redis', () => ({ getRedis: () => mockGetRedis() }));

describe('profile search budget', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    nodeEnv = 'test';
    vercelEnv = undefined;
  });

  it('fails closed in production when Redis is unavailable', async () => {
    nodeEnv = 'production';
    vercelEnv = 'production';
    mockGetRedis.mockReturnValue(null);
    const { reserveProfileSearchAttempt } = await import(
      '@/lib/profile-search/budget'
    );

    await expect(
      reserveProfileSearchAttempt(
        'attempt-1',
        'scheduled',
        new Date('2026-07-16T12:00:00.000Z')
      )
    ).resolves.toBe(false);
  });

  it('allows local development without Redis', async () => {
    mockGetRedis.mockReturnValue(null);
    const { reserveProfileSearchAttempt } = await import(
      '@/lib/profile-search/budget'
    );
    await expect(
      reserveProfileSearchAttempt('attempt-1', 'scheduled')
    ).resolves.toBe(true);
  });

  it('uses atomic daily, retry, and idempotency keys', async () => {
    const evalMock = vi.fn().mockResolvedValue(1);
    mockGetRedis.mockReturnValue({ eval: evalMock });
    const { reserveProfileSearchAttempt } = await import(
      '@/lib/profile-search/budget'
    );
    const allowed = await reserveProfileSearchAttempt(
      'attempt-2',
      'retry',
      new Date('2026-07-16T12:00:00.000Z')
    );

    expect(allowed).toBe(true);
    expect(evalMock).toHaveBeenCalledWith(
      expect.any(String),
      [
        'profile-search:budget:day:2026-07-16',
        'profile-search:retry-budget:day:2026-07-16',
        'profile-search:attempt:attempt-2',
      ],
      [200, 4, 'retry', 43_200]
    );
  });

  it('returns false when Redis denies the reservation', async () => {
    mockGetRedis.mockReturnValue({ eval: vi.fn().mockResolvedValue(0) });
    const { reserveProfileSearchAttempt } = await import(
      '@/lib/profile-search/budget'
    );
    await expect(
      reserveProfileSearchAttempt('attempt-3', 'scheduled')
    ).resolves.toBe(false);
  });
});
