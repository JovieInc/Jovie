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

/**
 * Map database errors to onboarding error codes
 */
export function mapDatabaseError(error: unknown): OnboardingError {
  const errorRecord = error as Record<string, unknown>;
  const errorMessage = (errorRecord?.message as string)?.toLowerCase() || '';

  // Unique constraint violations
  if (errorRecord?.code === '23505' || errorMessage.includes('duplicate')) {
    // Handle various forms of username unique errors (normalized/index names)
    if (
      errorMessage.includes('username') ||
      errorMessage.includes('username_normalized') ||
      errorMessage.includes('creator_profiles_username_normalized_unique_idx')
    ) {
      return createOnboardingError(
        OnboardingErrorCode.USERNAME_TAKEN,
        'Username is already taken',
        errorRecord?.message as string
      );
    }
    if (errorMessage.includes('user_id')) {
      return createOnboardingError(
        OnboardingErrorCode.PROFILE_EXISTS,
        'Profile already exists for this user',
        errorRecord?.message as string
      );
    }
    return createOnboardingError(
      OnboardingErrorCode.CONSTRAINT_VIOLATION,
      'Data constraint violation',
      errorRecord?.message as string
    );
  }

  // Foreign key violations
  if (errorRecord?.code === '23503') {
    return createOnboardingError(
      OnboardingErrorCode.DATABASE_ERROR,
      'Invalid reference data',
      errorRecord?.message as string
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
  if (errorRecord?.code === 'PGRST301' || errorMessage.includes('jwt')) {
    return createOnboardingError(
      OnboardingErrorCode.INVALID_SESSION,
      'Authentication session expired',
      errorRecord?.message as string,
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
