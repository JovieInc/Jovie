import 'server-only';

export const STRIPE_CONNECT_PLATFORM_PROFILE_INCOMPLETE_PATTERN =
  /complete your platform profile to use Connect/i;

/** Retry-After value (seconds) for platform-profile-incomplete 503 responses. */
export const STRIPE_CONNECT_PLATFORM_GUARD_TTL_SECONDS = 30 * 60;

export const STRIPE_CONNECT_PLATFORM_GUARD_TTL_MS =
  STRIPE_CONNECT_PLATFORM_GUARD_TTL_SECONDS * 1000;

export type StripeConnectOnboardErrorCode =
  | 'platform_profile_incomplete'
  | 'unknown';

export interface StripeConnectOnboardError {
  readonly code: StripeConnectOnboardErrorCode;
  readonly userMessage: string;
  readonly status: number;
  readonly logLevel: 'warning' | 'error';
}

export const STRIPE_CONNECT_PLATFORM_PROFILE_INCOMPLETE_ERROR: StripeConnectOnboardError =
  {
    code: 'platform_profile_incomplete',
    userMessage:
      'Payout setup is temporarily unavailable. Please try again later.',
    status: 503,
    logLevel: 'warning',
  };

let platformProfileBlockedUntilMs: number | null = null;

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

export function isStripeConnectPlatformProfileIncompleteError(
  error: unknown
): boolean {
  const message = extractStripeErrorMessage(error);
  return Boolean(
    message && STRIPE_CONNECT_PLATFORM_PROFILE_INCOMPLETE_PATTERN.test(message)
  );
}

/**
 * Short-circuit Stripe Connect onboarding after a platform-profile failure so
 * we do not keep hammering live account-creation APIs.
 */
export function blockStripeConnectPlatformProfile(
  ttlMs: number = STRIPE_CONNECT_PLATFORM_GUARD_TTL_MS
): void {
  platformProfileBlockedUntilMs = Date.now() + ttlMs;
}

export function isStripeConnectPlatformProfileBlocked(): boolean {
  return (
    platformProfileBlockedUntilMs !== null &&
    Date.now() < platformProfileBlockedUntilMs
  );
}

/** Test-only reset for guard state. */
export function clearStripeConnectPlatformProfileBlock(): void {
  platformProfileBlockedUntilMs = null;
}

/**
 * Classify Stripe Connect onboarding failures so platform configuration gaps
 * return a safe 503 instead of a generic 500 + critical Sentry alert.
 */
export function classifyStripeConnectOnboardError(
  error: unknown
): StripeConnectOnboardError {
  if (isStripeConnectPlatformProfileIncompleteError(error)) {
    blockStripeConnectPlatformProfile();
    return STRIPE_CONNECT_PLATFORM_PROFILE_INCOMPLETE_ERROR;
  }

  return {
    code: 'unknown',
    userMessage: 'Failed to start Stripe Connect onboarding',
    status: 500,
    logLevel: 'error',
  };
}
