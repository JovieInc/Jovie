/**
 * Onboarding error codes and handling
 */

export enum OnboardingErrorCode {
  // Authentication errors
  NOT_AUTHENTICATED = 'NOT_AUTHENTICATED',
  INVALID_SESSION = 'INVALID_SESSION',

  // Validation errors
  INVALID_USERNAME = 'INVALID_USERNAME',
  DISPLAY_NAME_REQUIRED = 'DISPLAY_NAME_REQUIRED',
  USERNAME_TOO_SHORT = 'USERNAME_TOO_SHORT',
  USERNAME_TOO_LONG = 'USERNAME_TOO_LONG',
  USERNAME_INVALID_FORMAT = 'USERNAME_INVALID_FORMAT',
  USERNAME_RESERVED = 'USERNAME_RESERVED',
  DISPLAY_NAME_TOO_LONG = 'DISPLAY_NAME_TOO_LONG',

  // Availability errors
  USERNAME_TAKEN = 'USERNAME_TAKEN',
  EMAIL_IN_USE = 'EMAIL_IN_USE',
  PROFILE_EXISTS = 'PROFILE_EXISTS',

  // Database errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  CONSTRAINT_VIOLATION = 'CONSTRAINT_VIOLATION',

  // Rate limiting
  RATE_LIMITED = 'RATE_LIMITED',
  TOO_MANY_ATTEMPTS = 'TOO_MANY_ATTEMPTS',

  // General errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
}

export interface OnboardingError {
  code: OnboardingErrorCode;
  message: string;
  details?: string;
  retryable?: boolean;
}

/**
 * Create a standardized onboarding error
 */
export function createOnboardingError(
  code: OnboardingErrorCode,
  message: string,
  details?: string,
  retryable = false
): OnboardingError {
  return {
    code,
    message,
    details,
    retryable,
  };
}

export interface UnwrappedDbError {
  code: string | null;
  message: string;
  constraint: string | null;
  detail: string | null;
}

function tryParseJsonError(str: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(str);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Not JSON, that's fine
  }
  return null;
}

/**
 * Recursively extract PostgreSQL error details from nested error structures.
 * Handles Neon/Drizzle error wrappers, cause chains, and JSON-encoded messages.
 */
export function unwrapDatabaseError(
  error: unknown,
  depth = 0
): UnwrappedDbError {
  if (depth > 10) {
    return { code: null, message: '', constraint: null, detail: null };
  }

  const record = error as Record<string, unknown>;
  const message = typeof record?.message === 'string' ? record.message : '';
  const code = typeof record?.code === 'string' ? record.code : null;
  const constraint =
    typeof record?.constraint === 'string' ? record.constraint : null;
  const detail = typeof record?.detail === 'string' ? record.detail : null;

  // Check for Neon/Drizzle nested error structures
  // Neon errors often have: error.cause.error with the actual PostgreSQL error
  const nestedError = record?.error;
  if (nestedError && typeof nestedError === 'object') {
    const nested = unwrapDatabaseError(nestedError, depth + 1);
    if (nested.code || nested.constraint) {
      return nested;
    }
  }

  // Check for errors array (some database drivers return arrays)
  const errors = record?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const firstError = unwrapDatabaseError(errors[0], depth + 1);
    if (firstError.code || firstError.constraint) {
      return firstError;
    }
  }

  // Try parsing message as JSON (some wrappers JSON-stringify the error)
  if (message && !code) {
    const parsed = tryParseJsonError(message);
    if (parsed) {
      const fromJson = unwrapDatabaseError(parsed, depth + 1);
      if (fromJson.code || fromJson.constraint) {
        return fromJson;
      }
    }
  }

  if (code || constraint) {
    return { code, message, constraint, detail };
  }

  // Recurse into cause
  const cause = record?.cause;
  if (cause && typeof cause === 'object') {
    return unwrapDatabaseError(cause, depth + 1);
  }

  return { code: null, message, constraint: null, detail };
}

const TRANSACTION_ROLLBACK_CODES = new Set(['40001', '40P01', '25P02']);
const TRANSACTION_ROLLBACK_PATTERNS = [
  'failed query: rollback',
  'transaction rolled back',
  'transaction was aborted',
  'current transaction is aborted',
  'serialization failure',
  'deadlock detected',
];

/**
 * Map database errors to onboarding error codes
 */
export function mapDatabaseError(error: unknown): OnboardingError {
  const errorRecord = error as Record<string, unknown>;
  const unwrapped = unwrapDatabaseError(error);

  const rawMessage = unwrapped.message || (errorRecord?.message as string);
  const errorMessage = (rawMessage || '').toLowerCase();
  const errorCode =
    unwrapped.code ?? (errorRecord?.code as string | null) ?? null;
  const constraint = (
    unwrapped.constraint ?? (errorRecord?.constraint as string | null)
  )?.toLowerCase();
  const detail = (
    unwrapped.detail ??
    (errorRecord?.detail as string | null) ??
    ''
  ).toLowerCase();

  // Check for custom SQL function error message (EMAIL_IN_USE from create_profile_with_user)
  if (errorMessage.includes('email_in_use')) {
    return createOnboardingError(
      OnboardingErrorCode.EMAIL_IN_USE,
      'Email is already in use',
      rawMessage
    );
  }

  // Unique constraint violations
  if (errorCode === '23505' || errorMessage.includes('duplicate')) {
    const isUsernameError =
      errorMessage.includes('username') ||
      errorMessage.includes('username_normalized') ||
      errorMessage.includes(
        'creator_profiles_username_normalized_unique_idx'
      ) ||
      detail.includes('username');

    if (isUsernameError) {
      return createOnboardingError(
        OnboardingErrorCode.USERNAME_TAKEN,
        'Username is already taken',
        rawMessage
      );
    }

    const isEmailError =
      constraint === 'users_email_unique' ||
      errorMessage.includes('users_email_unique') ||
      errorMessage.includes('email') ||
      detail.includes('email');

    if (isEmailError) {
      return createOnboardingError(
        OnboardingErrorCode.EMAIL_IN_USE,
        'Email is already in use',
        rawMessage
      );
    }

    if (errorMessage.includes('user_id') || detail.includes('user_id')) {
      return createOnboardingError(
        OnboardingErrorCode.PROFILE_EXISTS,
        'Profile already exists for this user',
        rawMessage
      );
    }

    return createOnboardingError(
      OnboardingErrorCode.CONSTRAINT_VIOLATION,
      'Data constraint violation',
      rawMessage
    );
  }

  // Foreign key violations
  if (errorCode === '23503') {
    return createOnboardingError(
      OnboardingErrorCode.DATABASE_ERROR,
      'Invalid reference data',
      rawMessage
    );
  }

  // Transaction rollback errors (e.g., serialization failures, deadlocks)
  const isTransactionError =
    (errorCode && TRANSACTION_ROLLBACK_CODES.has(errorCode)) ||
    TRANSACTION_ROLLBACK_PATTERNS.some(pattern =>
      errorMessage.includes(pattern)
    );

  if (isTransactionError) {
    return createOnboardingError(
      OnboardingErrorCode.TRANSACTION_FAILED,
      'Profile creation failed. Please try again',
      rawMessage,
      true
    );
  }

  // Network/connection errors
  if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
    return createOnboardingError(
      OnboardingErrorCode.NETWORK_ERROR,
      'Network error occurred',
      rawMessage,
      true
    );
  }

  // JWT/auth errors
  if (errorCode === 'PGRST301' || errorMessage.includes('jwt')) {
    return createOnboardingError(
      OnboardingErrorCode.INVALID_SESSION,
      'Authentication session expired',
      rawMessage,
      true
    );
  }

  // Default database error
  return createOnboardingError(
    OnboardingErrorCode.DATABASE_ERROR,
    'Database operation failed',
    rawMessage,
    true
  );
}

/**
 * Get user-friendly error messages for error codes
 */
export function getUserFriendlyMessage(code: OnboardingErrorCode): string {
  switch (code) {
    case OnboardingErrorCode.NOT_AUTHENTICATED:
      return 'Please sign in to continue';
    case OnboardingErrorCode.INVALID_SESSION:
      return 'Your session has expired. Please refresh and try again';
    case OnboardingErrorCode.DISPLAY_NAME_REQUIRED:
      return 'Please enter your name to finish setup';
    case OnboardingErrorCode.INVALID_USERNAME:
      return 'Please choose a valid username';
    case OnboardingErrorCode.USERNAME_TOO_SHORT:
      return 'Username must be at least 3 characters long';
    case OnboardingErrorCode.USERNAME_TOO_LONG:
      return 'Username must be no more than 30 characters long';
    case OnboardingErrorCode.USERNAME_INVALID_FORMAT:
      return 'Username can only contain letters, numbers, and underscores';
    case OnboardingErrorCode.USERNAME_RESERVED:
      return 'This username is reserved. Please choose another';
    case OnboardingErrorCode.USERNAME_TAKEN:
      return 'Username is already taken. Please choose another';
    case OnboardingErrorCode.EMAIL_IN_USE:
      return 'This email is already associated with another account.';
    case OnboardingErrorCode.PROFILE_EXISTS:
      return 'You already have a profile. Redirecting to dashboard...';
    case OnboardingErrorCode.RATE_LIMITED:
      return 'Too many attempts. Please wait a moment and try again';
    case OnboardingErrorCode.NETWORK_ERROR:
      return 'Network error. Please check your connection and try again';
    case OnboardingErrorCode.DATABASE_ERROR:
      return 'A database error occurred. Please try again';
    case OnboardingErrorCode.TRANSACTION_FAILED:
      return 'Profile creation failed. Please try again';
    default:
      return 'An unexpected error occurred. Please try again';
  }
}

export function onboardingErrorToError(error: OnboardingError): Error {
  return new Error(`[${error.code}] ${error.message}`);
}
