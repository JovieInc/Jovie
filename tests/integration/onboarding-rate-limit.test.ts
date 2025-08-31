import { beforeEach, describe, expect, it } from 'vitest';
import { OnboardingErrorCode } from '@/lib/errors/onboarding';
import { enforceOnboardingRateLimit } from '@/lib/onboarding/rate-limit';
import { redis } from '@/lib/redis';

const TEST_USER = 'test-user';
const TEST_USER_2 = 'test-user-2';
const TEST_IP = '203.0.113.1';
const TEST_IP_2 = '203.0.113.2';
const USER_KEY = `onboarding:user:${TEST_USER}`;
const USER_KEY_2 = `onboarding:user:${TEST_USER_2}`;
const IP_KEY = `onboarding:ip:${TEST_IP}`;
const IP_KEY_2 = `onboarding:ip:${TEST_IP_2}`;

describe('enforceOnboardingRateLimit', () => {
  beforeEach(async () => {
    // Clean up all test keys
    await Promise.all([
      redis.del(USER_KEY),
      redis.del(USER_KEY_2),
      redis.del(IP_KEY),
      redis.del(IP_KEY_2),
    ]);
  });

  it('allows attempts under the limit', async () => {
    await expect(
      enforceOnboardingRateLimit({
        userId: TEST_USER,
        ip: TEST_IP,
        limit: 2,
        window: 10,
      })
    ).resolves.toBeUndefined();
    await expect(
      enforceOnboardingRateLimit({
        userId: TEST_USER,
        ip: TEST_IP,
        limit: 2,
        window: 10,
      })
    ).resolves.toBeUndefined();
  });

  it('throttles when user limit exceeded', async () => {
    await enforceOnboardingRateLimit({
      userId: TEST_USER,
      ip: TEST_IP,
      limit: 2,
      window: 10,
    });
    await enforceOnboardingRateLimit({
      userId: TEST_USER,
      ip: TEST_IP_2, // Different IP to test user limit specifically
      limit: 2,
      window: 10,
    });
    await expect(
      enforceOnboardingRateLimit({
        userId: TEST_USER,
        ip: TEST_IP_2,
        limit: 2,
        window: 10,
      })
    ).rejects.toMatchObject({ code: OnboardingErrorCode.RATE_LIMITED });
  });

  it('throttles when IP limit exceeded', async () => {
    await enforceOnboardingRateLimit({
      userId: TEST_USER,
      ip: TEST_IP,
      limit: 2,
      window: 10,
    });
    await enforceOnboardingRateLimit({
      userId: TEST_USER_2, // Different user to test IP limit specifically
      ip: TEST_IP,
      limit: 2,
      window: 10,
    });
    await expect(
      enforceOnboardingRateLimit({
        userId: TEST_USER_2,
        ip: TEST_IP,
        limit: 2,
        window: 10,
      })
    ).rejects.toMatchObject({ code: OnboardingErrorCode.RATE_LIMITED });
  });

  it('skips IP rate limiting when checkIP is false', async () => {
    // Exhaust IP limit first
    await enforceOnboardingRateLimit({
      userId: TEST_USER,
      ip: TEST_IP,
      limit: 1,
      window: 10,
    });

    // Should still allow new user with same IP when checkIP = false
    await expect(
      enforceOnboardingRateLimit({
        userId: TEST_USER_2,
        ip: TEST_IP,
        limit: 1,
        window: 10,
        checkIP: false,
      })
    ).resolves.toBeUndefined();
  });

  it('skips IP rate limiting for unknown IP', async () => {
    // Should allow requests with unknown IP
    await expect(
      enforceOnboardingRateLimit({
        userId: TEST_USER,
        ip: 'unknown',
        limit: 1,
        window: 10,
        checkIP: true,
      })
    ).resolves.toBeUndefined();

    // Should allow multiple requests with unknown IP (only user limit applies)
    await expect(
      enforceOnboardingRateLimit({
        userId: TEST_USER,
        ip: 'unknown',
        limit: 1,
        window: 10,
        checkIP: true,
      })
    ).rejects.toMatchObject({ code: OnboardingErrorCode.RATE_LIMITED });
  });

  it('properly handles race conditions with expiry', async () => {
    // This test verifies that our atomic SET NX EX approach works
    const promises = Array.from({ length: 3 }, () =>
      enforceOnboardingRateLimit({
        userId: TEST_USER,
        ip: TEST_IP,
        limit: 2,
        window: 10,
      })
    );

    const results = await Promise.allSettled(promises);
    
    // Should have 2 successful and 1 failed (rate limited)
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(
      r => r.status === 'rejected' && 
      (r.reason as any)?.code === OnboardingErrorCode.RATE_LIMITED
    ).length;

    expect(successful).toBe(2);
    expect(failed).toBe(1);
  });

  it('maintains separate counters for different users and IPs', async () => {
    // Different users should have independent limits
    await expect(
      enforceOnboardingRateLimit({
        userId: TEST_USER,
        ip: TEST_IP,
        limit: 1,
        window: 10,
      })
    ).resolves.toBeUndefined();

    await expect(
      enforceOnboardingRateLimit({
        userId: TEST_USER_2,
        ip: TEST_IP_2,
        limit: 1,
        window: 10,
      })
    ).resolves.toBeUndefined();

    // Both should be rate limited on their second attempt
    await expect(
      enforceOnboardingRateLimit({
        userId: TEST_USER,
        ip: TEST_IP,
        limit: 1,
        window: 10,
      })
    ).rejects.toMatchObject({ code: OnboardingErrorCode.RATE_LIMITED });

    await expect(
      enforceOnboardingRateLimit({
        userId: TEST_USER_2,
        ip: TEST_IP_2,
        limit: 1,
        window: 10,
      })
    ).rejects.toMatchObject({ code: OnboardingErrorCode.RATE_LIMITED });
  });
});
