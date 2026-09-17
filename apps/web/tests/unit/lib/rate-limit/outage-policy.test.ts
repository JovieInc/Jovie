import { describe, expect, it } from 'vitest';
import { RATE_LIMITERS } from '@/lib/rate-limit/config';
import {
  mandatoryLimitersMissingRequireRedis,
  RATE_LIMIT_OUTAGE_POLICY,
  REDIS_DATA_CONSUMERS,
  type RedisLimiterOutagePolicy,
  unpinnedLimiterPolicies,
  wrongPolicyLimiters,
} from '@/lib/rate-limit/outage-policy';

describe('RATE_LIMIT_OUTAGE_POLICY', () => {
  it('pins every limiter and fail-closes mandatory spend/security', () => {
    expect(
      unpinnedLimiterPolicies(
        Object.keys(RATE_LIMITERS),
        RATE_LIMIT_OUTAGE_POLICY
      )
    ).toEqual([]);
    expect(
      mandatoryLimitersMissingRequireRedis(
        RATE_LIMITERS,
        RATE_LIMIT_OUTAGE_POLICY
      )
    ).toEqual([]);
    expect(
      wrongPolicyLimiters(RATE_LIMITERS, RATE_LIMIT_OUTAGE_POLICY)
    ).toEqual([]);

    for (const name of [
      'paymentIntent',
      'tipCheckout',
      'merchCheckout',
      'aiChatWeeklyPro',
      'onboarding',
      'adminImpersonate',
      'accountDelete',
    ] as const) {
      expect(RATE_LIMIT_OUTAGE_POLICY[name]).toMatchObject({
        class: 'mandatory',
        callerOnUnavailable: 'deny',
      });
    }
    expect(RATE_LIMIT_OUTAGE_POLICY.aiChat.class).toBe('advisory');
    expect(RATE_LIMIT_OUTAGE_POLICY.publicClick.callerOnUnavailable).toBe(
      'allow'
    );
    expect(RATE_LIMIT_OUTAGE_POLICY.trackingClicks.callerOnUnavailable).toBe(
      'drop'
    );
  });

  it('fails deliberate-red unpinned and unrequireRedis inventories', () => {
    expect(
      unpinnedLimiterPolicies(['api', 'paymentIntent'], {
        api: RATE_LIMIT_OUTAGE_POLICY.api,
      } as Record<string, RedisLimiterOutagePolicy>)
    ).toEqual(['paymentIntent']);
    expect(
      mandatoryLimitersMissingRequireRedis(
        {
          ...RATE_LIMITERS,
          paymentIntent: {
            ...RATE_LIMITERS.paymentIntent,
            requireRedis: false,
          },
        },
        RATE_LIMIT_OUTAGE_POLICY
      )
    ).toEqual(['paymentIntent']);
  });
});

describe('REDIS_DATA_CONSUMERS', () => {
  it('separates fail-closed coordination from origin-read caches', () => {
    expect(REDIS_DATA_CONSUMERS['auth/secondary-storage'].class).toBe(
      'mandatory'
    );
    expect(REDIS_DATA_CONSUMERS['db/cache']).toMatchObject({
      class: 'optional',
      staleBound: expect.stringMatching(/ttl/i),
    });
  });
});
