/**
 * Error handling and logging for onboarding
 * Note: This is a helper module, not a Server Action file.
 * It's called internally by server actions, not from the client.
 */

import * as Sentry from '@sentry/nextjs';
import {
  mapDatabaseError,
  onboardingErrorToError,
  unwrapDatabaseError,
} from '@/lib/errors/onboarding';
import { extractErrorMessage } from '@/lib/utils/errors';

/**
 * Logs and captures onboarding errors with full context.
 */
export function logOnboardingError(
  error: unknown,
  context: { username: string; displayName?: string; email?: string | null }
): Error {
  const unwrapped = unwrapDatabaseError(error);
  const effectiveCode = unwrapped.code || 'UNKNOWN_DB_ERROR';
  const effectiveConstraint = unwrapped.constraint;

  // Add breadcrumbs for debugging context
  Sentry.addBreadcrumb({
    category: 'onboarding',
    message: 'Database error details',
    level: 'error',
    data: {
      code: effectiveCode,
      constraint: effectiveConstraint,
      detail: unwrapped.detail,
      message: unwrapped.message,
    },
  });

  Sentry.addBreadcrumb({
    category: 'onboarding',
    message: 'Request context',
    level: 'info',
    data: {
      username: context.username,
      displayName: context.displayName,
      email: context.email,
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorMessage: extractErrorMessage(error),
    },
  });

  Sentry.captureException(error, {
    tags: {
      context: 'onboarding_submission',
      username: context.username ?? 'unknown',
      db_error_code: effectiveCode,
    },
    extra: {
      displayName: context.displayName,
      email: context.email,
      dbErrorCode: effectiveCode,
      dbConstraint: effectiveConstraint,
      dbDetail: unwrapped.detail,
      rawErrorKeys:
        error && typeof error === 'object' ? Object.keys(error) : [],
    },
    fingerprint: effectiveConstraint
      ? ['onboarding', effectiveCode, effectiveConstraint]
      : ['onboarding', effectiveCode],
  });

  const resolvedError =
    error instanceof Error && /^\[([A-Z_]+)\]/.test(error.message)
      ? error
      : onboardingErrorToError(mapDatabaseError(error));

  return resolvedError;
}
