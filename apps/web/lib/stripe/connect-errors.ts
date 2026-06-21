import 'server-only';

export const STRIPE_CONNECT_PLATFORM_PROFILE_INCOMPLETE_PATTERN =
  /complete your platform profile to use Connect/i;

export type StripeConnectOnboardErrorCode =
  | 'platform_profile_incomplete'
  | 'unknown';

export interface StripeConnectOnboardError {
  readonly code: StripeConnectOnboardErrorCode;
  readonly userMessage: string;
  readonly status: number;
  readonly logLevel: 'warning' | 'error';
}

function extractStripeErrorMessage(error: unknown): string | null {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message;
    return typeof message === 'string' ? message : null;
  }

  return null;
}

/**
 * Classify Stripe Connect onboarding failures so platform configuration gaps
 * return a safe 503 instead of a generic 500 + critical Sentry alert.
 */
export function classifyStripeConnectOnboardError(
  error: unknown
): StripeConnectOnboardError {
  const message = extractStripeErrorMessage(error);

  if (
    message &&
    STRIPE_CONNECT_PLATFORM_PROFILE_INCOMPLETE_PATTERN.test(message)
  ) {
    return {
      code: 'platform_profile_incomplete',
      userMessage:
        'Payout setup is temporarily unavailable. Please try again later.',
      status: 503,
      logLevel: 'warning',
    };
  }

  return {
    code: 'unknown',
    userMessage: 'Failed to start Stripe Connect onboarding',
    status: 500,
    logLevel: 'error',
  };
}
