import { describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
}));

import * as Sentry from '@sentry/nextjs';
import type { RateLimitResult } from '@/lib/rate-limit/types';
import { allowIfRateLimitBackendDegraded } from '@/lib/rate-limit/utils';

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
