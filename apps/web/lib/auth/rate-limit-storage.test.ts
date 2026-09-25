import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRedis: vi.fn(),
  logger: { warn: vi.fn() },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/redis', () => ({ getRedis: mocks.getRedis }));
vi.mock('@/lib/utils/logger', () => ({
  logger: mocks.logger,
}));

import { authRateLimitStorage } from '@/lib/auth/rate-limit-storage';

const rule = { window: 60, max: 2 };

describe('Better Auth Redis rate-limit storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('increments a prefixed counter and sets TTL only when the key is created', async () => {
    const redis = {
      incr: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2),
      expire: vi.fn().mockResolvedValue(1),
    };
    mocks.getRedis.mockReturnValue(redis);

    await expect(
      authRateLimitStorage.consume('1.2.3.4|/sign-in/email', rule)
    ).resolves.toEqual({ allowed: true, retryAfter: null });
    await expect(
      authRateLimitStorage.consume('1.2.3.4|/sign-in/email', rule)
    ).resolves.toEqual({ allowed: true, retryAfter: null });

    expect(redis.incr).toHaveBeenCalledWith('ba:rl:1.2.3.4|/sign-in/email');
    expect(redis.expire).toHaveBeenCalledTimes(1);
    expect(redis.expire).toHaveBeenCalledWith(
      'ba:rl:1.2.3.4|/sign-in/email',
      60
    );
  });

  it('denies once the window count passes the rule max', async () => {
    const redis = {
      incr: vi.fn().mockResolvedValue(3),
      expire: vi.fn(),
    };
    mocks.getRedis.mockReturnValue(redis);

    await expect(
      authRateLimitStorage.consume('10.0.0.1|/sign-up/email', rule)
    ).resolves.toEqual({ allowed: false, retryAfter: 60 });
    expect(redis.expire).not.toHaveBeenCalled();
  });

  it('degrades open when Redis is missing or the counter command fails', async () => {
    mocks.getRedis.mockReturnValue(null);
    await expect(
      authRateLimitStorage.consume('ip|/email-otp/send-verification-otp', rule)
    ).resolves.toEqual({ allowed: true, retryAfter: null });

    mocks.getRedis.mockReturnValue({
      incr: vi.fn().mockRejectedValue(new Error('quota')),
      expire: vi.fn(),
    });
    await expect(
      authRateLimitStorage.consume('ip|/email-otp/send-verification-otp', rule)
    ).resolves.toEqual({ allowed: true, retryAfter: null });
  });
});
