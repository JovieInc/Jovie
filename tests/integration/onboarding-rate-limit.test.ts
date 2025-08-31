import { beforeEach, describe, expect, it } from 'vitest';
import { OnboardingErrorCode } from '@/lib/errors/onboarding';
import { enforceOnboardingRateLimit } from '@/lib/onboarding/rate-limit';
import { redis } from '@/lib/redis';

const TEST_USER = 'test-user';
const TEST_IP = '203.0.113.1';
const USER_KEY = `onboarding:user:${TEST_USER}`;
const IP_KEY = `onboarding:ip:${TEST_IP}`;

describe('enforceOnboardingRateLimit', () => {
  beforeEach(async () => {
    await redis.del(USER_KEY);
    await redis.del(IP_KEY);
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

  it('throttles when limit exceeded', async () => {
    await enforceOnboardingRateLimit({
      userId: TEST_USER,
      ip: TEST_IP,
      limit: 2,
      window: 10,
    });
    await enforceOnboardingRateLimit({
      userId: TEST_USER,
      ip: TEST_IP,
      limit: 2,
      window: 10,
    });
    await expect(
      enforceOnboardingRateLimit({
        userId: TEST_USER,
        ip: TEST_IP,
        limit: 2,
        window: 10,
      })
    ).rejects.toMatchObject({ code: OnboardingErrorCode.RATE_LIMITED });
  });
});
