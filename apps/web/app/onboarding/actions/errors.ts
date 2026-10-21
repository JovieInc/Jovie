/** Error reporting and response mapping for onboarding persistence. */
import {
  mapDatabaseError,
  onboardingErrorToError,
} from '@/lib/errors/onboarding';
import {
  captureRevenueSpineFailure,
  type RevenueSpineStage,
} from '@/lib/observability/revenue-spine';

export function logOnboardingError(
  error: unknown,
  context: {
    readonly userId?: string | null;
    readonly stage: Extract<
      RevenueSpineStage,
      'onboarding_persistence' | 'profile_claim'
    >;
  }
): Error {
  captureRevenueSpineFailure({
    stage: context.stage,
    severity: 'blocked',
    userId: context.userId,
    error,
  });
  return error instanceof Error && /^\[([A-Z_]+)\]/.test(error.message)
    ? error
    : onboardingErrorToError(mapDatabaseError(error));
}
