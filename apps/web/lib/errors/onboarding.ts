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

function unwrapDatabaseError(
  error: unknown,
  depth = 0
): { code: string | null; message: string; constraint: string | null } {
  if (depth > 5) {
    return { code: null, message: '', constraint: null };
  }

  const record = error as Record<string, unknown>;
  const message = typeof record?.message === 'string' ? record.message : '';
  const code = typeof record?.code === 'string' ? record.code : null;
  const constraint =
    typeof record?.constraint === 'string' ? record.constraint : null;

  if (code || constraint) {
    return { code, message, constraint };
  }

  const cause = record?.cause;
  if (cause && typeof cause === 'object') {
    return unwrapDatabaseError(cause, depth + 1);
  }

  return { code: null, message, constraint: null };
}

/**
 * Map database errors to onboarding error codes
 */
export function mapDatabaseError(error: unknown): OnboardingError {
  const errorRecord = error as Record<string, unknown>;
  const unwrapped = unwrapDatabaseError(error);
  const errorMessage = (
    unwrapped.message ||
    (errorRecord?.message as string) ||
    ''
  ).toLowerCase();
  const errorCode =
    unwrapped.code ?? (errorRecord?.code as string | null) ?? null;
  const constraint = (
    unwrapped.constraint ??
    (errorRecord?.constraint as string | null) ??
    null
  )?.toLowerCase();

  const transactionRollbackCodes = new Set(['40001', '40P01', '25P02']);
  const transactionRollbackPatterns = [
    'failed query: rollback',
    'transaction rolled back',
    'transaction was aborted',
    'current transaction is aborted',
    'serialization failure',
    'deadlock detected',
  ];

  // Unique constraint violations
  if (errorCode === '23505' || errorMessage.includes('duplicate')) {
    // Handle various forms of username unique errors (normalized/index names)
    if (
      errorMessage.includes('username') ||
      errorMessage.includes('username_normalized') ||
      errorMessage.includes('creator_profiles_username_normalized_unique_idx')
    ) {
      return createOnboardingError(
        OnboardingErrorCode.USERNAME_TAKEN,
        'Username is already taken',
        unwrapped.message || (errorRecord?.message as string)
      );
    }

    if (
      constraint === 'users_email_unique' ||
      constraint === 'idx_users_email_unique' ||
      errorMessage.includes('users_email_unique') ||
      errorMessage.includes('idx_users_email_unique')
    ) {
      return createOnboardingError(
        OnboardingErrorCode.EMAIL_IN_USE,
        'Email is already in use',
        unwrapped.message || (errorRecord?.message as string)
      );
    }

    if (errorMessage.includes('user_id')) {
      return createOnboardingError(
        OnboardingErrorCode.PROFILE_EXISTS,
        'Profile already exists for this user',
        unwrapped.message || (errorRecord?.message as string)
      );
    }
    return createOnboardingError(
      OnboardingErrorCode.CONSTRAINT_VIOLATION,
      'Data constraint violation',
      unwrapped.message || (errorRecord?.message as string)
    );
  }

  // Foreign key violations
  if (errorCode === '23503') {
    return createOnboardingError(
      OnboardingErrorCode.DATABASE_ERROR,
      'Invalid reference data',
      unwrapped.message || (errorRecord?.message as string)
    );
  }

  // Transaction rollback errors (e.g., serialization failures, deadlocks)
  if (
    (errorCode && transactionRollbackCodes.has(errorCode)) ||
    transactionRollbackPatterns.some(pattern => errorMessage.includes(pattern))
  ) {
    return createOnboardingError(
      OnboardingErrorCode.TRANSACTION_FAILED,
      'Profile creation failed. Please try again',
      unwrapped.message || (errorRecord?.message as string),
      true // Retryable – caller can safely retry onboarding
    );
  }

  // Network/connection errors
  if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
    return createOnboardingError(
      OnboardingErrorCode.NETWORK_ERROR,
      'Network error occurred',
      errorRecord?.message as string,
      true // Retryable
    );
  }

  // JWT/auth errors
  if (errorCode === 'PGRST301' || errorMessage.includes('jwt')) {
    return createOnboardingError(
      OnboardingErrorCode.INVALID_SESSION,
      'Authentication session expired',
      unwrapped.message || (errorRecord?.message as string),
      true // Retryable
    );
  }

  // Default database error
  return createOnboardingError(
    OnboardingErrorCode.DATABASE_ERROR,
    'Database operation failed',
    errorRecord?.message as string,
    true // Potentially retryable
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
