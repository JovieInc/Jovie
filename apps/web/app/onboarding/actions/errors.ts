/**
 * Error handling and logging for onboarding
 */

'use server';

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
  console.error('🔴 ONBOARDING ERROR:', error);
  console.error(
    '🔴 ERROR STACK:',
    error instanceof Error ? error.stack : 'No stack available'
  );

  const unwrapped = unwrapDatabaseError(error);
  const effectiveCode = unwrapped.code || 'UNKNOWN_DB_ERROR';
  const effectiveConstraint = unwrapped.constraint;

  console.error('🔴 DATABASE ERROR DETAILS:', {
    code: effectiveCode,
    constraint: effectiveConstraint,
    detail: unwrapped.detail,
    message: unwrapped.message,
  });

  console.error('🔴 REQUEST CONTEXT:', {
    username: context.username,
    displayName: context.displayName,
    email: context.email,
    timestamp: new Date().toISOString(),
    errorName: error instanceof Error ? error.name : 'Unknown',
    errorMessage: extractErrorMessage(error),
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

  console.error('🔴 RESOLVED ERROR TYPE:', resolvedError.message);

  return resolvedError;
}
