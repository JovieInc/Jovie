import { describe, expect, it, vi } from 'vitest';
import { logOnboardingError } from './errors';

const capture = vi.hoisted(() => vi.fn());
vi.mock('@/lib/observability/revenue-spine', () => ({
  captureRevenueSpineFailure: capture,
}));

describe('onboarding failure reporting', () => {
  it.each(['onboarding_persistence', 'profile_claim'] as const)(
    'reports %s with the shared contract and preserves recovery codes',
    stage => {
      const error = new Error('[CLAIM_EXPIRED] Retry this claim');
      expect(logOnboardingError(error, { stage, userId: 'app-user' })).toBe(
        error
      );
      expect(capture).toHaveBeenLastCalledWith({
        stage,
        severity: 'blocked',
        userId: 'app-user',
        error,
      });
    }
  );
});
