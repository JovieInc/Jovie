import { describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
}));

import * as Sentry from '@sentry/nextjs';
import type { RateLimitResult } from '@/lib/rate-limit/types';
import {
  allowIfRateLimitBackendDegraded,
  rateLimitDenialMessage,
  rateLimitDenialStatus,
  withDeniedRateLimitReason,
} from '@/lib/rate-limit/utils';

function denied(overrides?: Partial<RateLimitResult>): RateLimitResult {
  return {
    success: false,
    limit: 10,
    remaining: 0,
    reset: new Date(Date.now() + 60_000),
    reason: 'blocked',
    ...overrides,
  };
}

describe('allowIfRateLimitBackendDegraded', () => {
  it('passes through successful results unchanged', () => {
    const allowed: RateLimitResult = {
      success: true,
      limit: 10,
      remaining: 9,
      reset: new Date(),
    };
    expect(allowIfRateLimitBackendDegraded(allowed)).toBe(allowed);
  });

  it('enforces denials from a healthy backend', () => {
    const result = denied();
    expect(allowIfRateLimitBackendDegraded(result)).toEqual(result);
  });

  it('allows degraded memory-fallback denials and breadcrumbs', () => {
    const result = allowIfRateLimitBackendDegraded(denied({ degraded: true }), {
      limiter: 'ai-chat',
    });
    expect(result.success).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.degraded).toBe(true);
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'rate-limit',
        level: 'warning',
      })
    );
  });

  it('allows unavailable-backend denials', () => {
    const result = allowIfRateLimitBackendDegraded(
      denied({ unavailable: true })
    );
    expect(result.success).toBe(true);
    expect(result.unavailable).toBe(true);
  });
});

describe('rate-limit denial helpers', () => {
  it('maps unavailable denials to 503 and exhausted denials to 429', () => {
    expect(rateLimitDenialStatus(denied({ unavailable: true }))).toBe(503);
    expect(rateLimitDenialStatus(denied())).toBe(429);
  });

  it('does not report an outage as quota exhaustion', () => {
    expect(
      rateLimitDenialMessage(
        denied({ unavailable: true }),
        'Too many requests.',
        'Temporarily unavailable.'
      )
    ).toBe('Temporarily unavailable.');
    expect(rateLimitDenialMessage(denied(), 'Too many requests.')).toBe(
      'Too many requests.'
    );
  });

  it('preserves unavailable reasons when applying domain copy', () => {
    const unavailable = denied({
      unavailable: true,
      reason: 'Tip Checkout rate limiter is temporarily unavailable',
    });
    expect(withDeniedRateLimitReason(unavailable, 'Too many checkouts.')).toBe(
      unavailable
    );
    expect(
      withDeniedRateLimitReason(denied(), 'Too many checkouts.').reason
    ).toBe('Too many checkouts.');
  });
});
