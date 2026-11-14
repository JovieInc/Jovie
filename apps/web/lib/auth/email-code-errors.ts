/**
 * Error copy and reporting for the email one-time-code auth form
 * (EmailCodeAuthForm). Client-safe: no server-only imports.
 */
import { captureWarning } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

// ============================================================================
// Code → copy table (plan design row 18)
// ============================================================================
// Better Auth error codes mapped to user-facing messages. The lockout state
// (MAX_ATTEMPTS) surfaces a "Request a new code" affordance that resets the
// flow back to the email step.

const SEND_ERROR_COPY: Record<string, string> = {
  rate_limit_exceeded: 'Too many requests. Please wait a moment and try again.',
  form_param_format_invalid:
    'That email address doesn’t look right. Check it and try again.',
};

const VERIFY_ERROR_COPY: Record<string, string> = {
  invalid_otp: 'That code is incorrect. Check your email and try again.',
  otp_expired: 'That code has expired. Send a new one and try again.',
  max_attempts_reached:
    'Too many incorrect attempts. Request a new code to try again.',
  too_many_attempts:
    'Too many incorrect attempts. Request a new code to try again.',
  rate_limit_exceeded: 'Too many attempts. Please wait a moment and try again.',
  // signup-admission.ts denies a verified code for an address with no account
  // and no active invitation. Better Auth has already consumed the code.
  signup_invite_required:
    'No Jovie account uses this email yet, and new accounts need an invitation. Use the email your invite went to, or request access.',
};

/**
 * Codes for which Better Auth has already consumed the OTP. Resubmitting the
 * same code would only report it as incorrect, so the form clears it.
 */
const SPENT_CODE_ERRORS = new Set(['signup_invite_required']);

function readErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    status?: unknown;
  };
  // Better Auth rate-limit rejections are bare 429s with no error code.
  if (candidate.status === 429) return 'rate_limit_exceeded';
  if (typeof candidate.code === 'string') return candidate.code.toLowerCase();
  if (typeof candidate.message === 'string') {
    // Better Auth errors sometimes carry the code in `message` as
    // `"code: ..."` — fall through to that.
    const match = /^([a-z_]+):/i.exec(candidate.message);
    if (match) return match[1].toLowerCase();
  }
  return undefined;
}

export function getSendErrorMessage(error: unknown): string {
  const code = readErrorCode(error);
  if (code && SEND_ERROR_COPY[code]) return SEND_ERROR_COPY[code];
  return 'Could not send the code. Please try again.';
}

export function getVerifyErrorMessage(error: unknown): string {
  const code = readErrorCode(error);
  if (code && VERIFY_ERROR_COPY[code]) return VERIFY_ERROR_COPY[code];
  return 'Could not verify the code. Please try again.';
}

function readErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const { status } = error as { status?: unknown };
  return typeof status === 'number' ? status : undefined;
}

/**
 * An unmapped verify failure shows the generic copy; report it so a new
 * server code can never fail silently again (2026-11-09 sign-in incident).
 */
export function reportUnmappedVerifyError(error: unknown): void {
  const code = readErrorCode(error);
  if (code && VERIFY_ERROR_COPY[code]) return;
  const context = {
    code: code ?? 'none',
    status: readErrorStatus(error),
    surface: 'EmailCodeAuthForm',
  };
  logger.warn('Email OTP verify failed', context, 'EmailCodeAuthForm');
  try {
    Promise.resolve(
      captureWarning(
        'Email OTP verify failed with an unmapped error code',
        error,
        context
      )
    ).catch(() => undefined);
  } catch {
    // Telemetry must never break the sign-in form.
  }
}

export function isSpentCodeError(error: unknown): boolean {
  const code = readErrorCode(error);
  return code !== undefined && SPENT_CODE_ERRORS.has(code);
}

export function isMaxAttemptsError(error: unknown): boolean {
  const code = readErrorCode(error);
  return code === 'max_attempts_reached' || code === 'too_many_attempts';
}
