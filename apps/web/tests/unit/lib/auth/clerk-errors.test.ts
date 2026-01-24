import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist mocks before module resolution
const { mockIsClerkAPIResponseError } = vi.hoisted(() => ({
  mockIsClerkAPIResponseError: vi.fn(),
}));

// Mock Clerk error checker
vi.mock('@clerk/nextjs/errors', () => ({
  isClerkAPIResponseError: mockIsClerkAPIResponseError,
}));

describe('clerk-errors.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('parseClerkError', () => {
    it('returns custom message for form_identifier_not_found', async () => {
      const clerkError = {
        errors: [{ code: 'form_identifier_not_found' }],
      };
      mockIsClerkAPIResponseError.mockReturnValue(true);

      const { parseClerkError } = await import('@/lib/auth/clerk-errors');
      const result = parseClerkError(clerkError);

      expect(result).toBe(
        "We couldn't find an account with that email. Would you like to sign up instead?"
      );
    });

    it('returns custom message for form_password_incorrect', async () => {
      const clerkError = {
        errors: [{ code: 'form_password_incorrect' }],
      };
      mockIsClerkAPIResponseError.mockReturnValue(true);

      const { parseClerkError } = await import('@/lib/auth/clerk-errors');
      const result = parseClerkError(clerkError);

      expect(result).toBe('Incorrect password. Please try again.');
    });

    it('returns custom message for form_code_incorrect', async () => {
      const clerkError = {
        errors: [{ code: 'form_code_incorrect' }],
      };
      mockIsClerkAPIResponseError.mockReturnValue(true);

      const { parseClerkError } = await import('@/lib/auth/clerk-errors');
      const result = parseClerkError(clerkError);

      expect(result).toBe(
        'That code is incorrect. Please check and try again.'
      );
    });

    it('returns custom message for verification_expired', async () => {
      const clerkError = {
        errors: [{ code: 'verification_expired' }],
      };
      mockIsClerkAPIResponseError.mockReturnValue(true);

      const { parseClerkError } = await import('@/lib/auth/clerk-errors');
      const result = parseClerkError(clerkError);

      expect(result).toBe(
        'Your verification code has expired. Please request a new one.'
      );
    });

    it('returns custom message for form_identifier_exists', async () => {
      const clerkError = {
        errors: [{ code: 'form_identifier_exists' }],
      };
      mockIsClerkAPIResponseError.mockReturnValue(true);

      const { parseClerkError } = await import('@/lib/auth/clerk-errors');
      const result = parseClerkError(clerkError);

      expect(result).toBe(
        'An account with this email already exists. Try signing in instead.'
      );
    });

    it('returns custom message for too_many_requests', async () => {
      const clerkError = {
        errors: [{ code: 'too_many_requests' }],
      };
      mockIsClerkAPIResponseError.mockReturnValue(true);

      const { parseClerkError } = await import('@/lib/auth/clerk-errors');
      const result = parseClerkError(clerkError);

      expect(result).toBe(
        'Too many attempts. Please wait a moment and try again.'
      );
    });

    it('returns custom message for rate_limit_exceeded', async () => {
      const clerkError = {
        errors: [{ code: 'rate_limit_exceeded' }],
      };
      mockIsClerkAPIResponseError.mockReturnValue(true);

      const { parseClerkError } = await import('@/lib/auth/clerk-errors');
      const result = parseClerkError(clerkError);

      expect(result).toBe(
        'Too many requests. Please wait before trying again.'
      );
    });

    it('returns custom message for captcha_missing', async () => {
      const clerkError = {
        errors: [{ code: 'captcha_missing' }],
      };
      mockIsClerkAPIResponseError.mockReturnValue(true);

      const { parseClerkError } = await import('@/lib/auth/clerk-errors');
      const result = parseClerkError(clerkError);

      expect(result).toBe(
        'Please disable ad blockers or try a different browser, then refresh the page.'
      );
    });

    it('returns custom message for bot_traffic_detected', async () => {
      const clerkError = {
        errors: [{ code: 'bot_traffic_detected' }],
      };
      mockIsClerkAPIResponseError.mockReturnValue(true);

      const { parseClerkError } = await import('@/lib/auth/clerk-errors');
      const result = parseClerkError(clerkError);

      expect(result).toBe(
        'Unable to verify your request. Please try again or use a different browser.'
      );
    });

    it('returns custom message for OAuth errors', async () => {
      const clerkError = {
        errors: [{ code: 'external_account_not_found' }],
      };
      mockIsClerkAPIResponseError.mockReturnValue(true);

      const { parseClerkError } = await import('@/lib/auth/clerk-errors');
      const result = parseClerkError(clerkError);

      expect(result).toBe(
        'No account found with this provider. Please sign up first.'
      );
    });

    it('falls back to longMessage when no custom message exists', async () => {
      const clerkError = {
        errors: [
          {
            code: 'unknown_error_code',
            longMessage: 'This is a detailed error message from Clerk.',
          },
        ],
      };
      mockIsClerkAPIResponseError.mockReturnValue(true);

      const { parseClerkError } = await import('@/lib/auth/clerk-errors');
      const result = parseClerkError(clerkError);

      expect(result).toBe('This is a detailed error message from Clerk.');
    });

    it('falls back to message when no longMessage exists', async () => {
      const clerkError = {
        errors: [
          {
            code: 'unknown_error_code',
            message: 'Short error message.',
          },
        ],
      };
      mockIsClerkAPIResponseError.mockReturnValue(true);

      const { parseClerkError } = await import('@/lib/auth/clerk-errors');
      const result = parseClerkError(clerkError);

      expect(result).toBe('Short error message.');
    });

    it('returns generic message when error has no message', async () => {
      const clerkError = {
        errors: [{ code: 'unknown_error_code' }],
      };
      mockIsClerkAPIResponseError.mockReturnValue(true);

      const { parseClerkError } = await import('@/lib/auth/clerk-errors');
      const result = parseClerkError(clerkError);

      expect(result).toBe('An unexpected error occurred. Please try again.');
    });

    it('returns generic message when errors array is empty', async () => {
      const clerkError = {
        errors: [],
      };
      mockIsClerkAPIResponseError.mockReturnValue(true);

      const { parseClerkError } = await import('@/lib/auth/clerk-errors');
      const result = parseClerkError(clerkError);

      expect(result).toBe('An unexpected error occurred. Please try again.');
    });

    it('handles standard Error objects', async () => {
      mockIsClerkAPIResponseError.mockReturnValue(false);

      const { parseClerkError } = await import('@/lib/auth/clerk-errors');
      const result = parseClerkError(new Error('Internal error'));

      expect(result).toBe('An unexpected error occurred. Please try again.');
    });

    it('handles non-Error objects', async () => {
      mockIsClerkAPIResponseError.mockReturnValue(false);

      const { parseClerkError } = await import('@/lib/auth/clerk-errors');
      const result = parseClerkError('string error');

      expect(result).toBe('An unexpected error occurred. Please try again.');
    });

    it('handles null/undefined errors', async () => {
      mockIsClerkAPIResponseError.mockReturnValue(false);

      const { parseClerkError } = await import('@/lib/auth/clerk-errors');

      expect(parseClerkError(null)).toBe(
        'An unexpected error occurred. Please try again.'
      );
      expect(parseClerkError(undefined)).toBe(
        'An unexpected error occurred. Please try again.'
      );
    });
  });

  describe('isSignUpSuggested', () => {
    it('returns true for form_identifier_not_found', async () => {
      const clerkError = {
        errors: [{ code: 'form_identifier_not_found' }],
      };
      mockIsClerkAPIResponseError.mockReturnValue(true);

      const { isSignUpSuggested } = await import('@/lib/auth/clerk-errors');
      const result = isSignUpSuggested(clerkError);

      expect(result).toBe(true);
    });

    it('returns false for other error codes', async () => {
      const clerkError = {
        errors: [{ code: 'form_password_incorrect' }],
      };
      mockIsClerkAPIResponseError.mockReturnValue(true);

      const { isSignUpSuggested } = await import('@/lib/auth/clerk-errors');
      const result = isSignUpSuggested(clerkError);

      expect(result).toBe(false);
    });

    it('returns false for non-Clerk errors', async () => {
      mockIsClerkAPIResponseError.mockReturnValue(false);

      const { isSignUpSuggested } = await import('@/lib/auth/clerk-errors');
      const result = isSignUpSuggested(new Error('test'));

      expect(result).toBe(false);
    });
  });

  describe('isSignInSuggested', () => {
    it('returns true for form_identifier_exists', async () => {
      const clerkError = {
        errors: [{ code: 'form_identifier_exists' }],
      };
      mockIsClerkAPIResponseError.mockReturnValue(true);

      const { isSignInSuggested } = await import('@/lib/auth/clerk-errors');
      const result = isSignInSuggested(clerkError);

      expect(result).toBe(true);
    });

    it('returns false for other error codes', async () => {
      const clerkError = {
        errors: [{ code: 'form_identifier_not_found' }],
      };
      mockIsClerkAPIResponseError.mockReturnValue(true);

      const { isSignInSuggested } = await import('@/lib/auth/clerk-errors');
      const result = isSignInSuggested(clerkError);

      expect(result).toBe(false);
    });

    it('returns false for non-Clerk errors', async () => {
      mockIsClerkAPIResponseError.mockReturnValue(false);

      const { isSignInSuggested } = await import('@/lib/auth/clerk-errors');
      const result = isSignInSuggested(new Error('test'));

      expect(result).toBe(false);
    });
  });

  describe('isRateLimited', () => {
    it('returns true for too_many_requests', async () => {
      const clerkError = {
        errors: [{ code: 'too_many_requests' }],
      };
      mockIsClerkAPIResponseError.mockReturnValue(true);

      const { isRateLimited } = await import('@/lib/auth/clerk-errors');
      const result = isRateLimited(clerkError);

      expect(result).toBe(true);
    });

    it('returns true for rate_limit_exceeded', async () => {
      const clerkError = {
        errors: [{ code: 'rate_limit_exceeded' }],
      };
      mockIsClerkAPIResponseError.mockReturnValue(true);

      const { isRateLimited } = await import('@/lib/auth/clerk-errors');
      const result = isRateLimited(clerkError);

      expect(result).toBe(true);
    });

    it('returns false for other error codes', async () => {
      const clerkError = {
        errors: [{ code: 'form_password_incorrect' }],
      };
      mockIsClerkAPIResponseError.mockReturnValue(true);

      const { isRateLimited } = await import('@/lib/auth/clerk-errors');
      const result = isRateLimited(clerkError);

      expect(result).toBe(false);
    });

    it('returns false for non-Clerk errors', async () => {
      mockIsClerkAPIResponseError.mockReturnValue(false);

      const { isRateLimited } = await import('@/lib/auth/clerk-errors');
      const result = isRateLimited(new Error('test'));

      expect(result).toBe(false);
    });
  });

  describe('isCodeExpired', () => {
    it('returns true for verification_expired', async () => {
      const clerkError = {
        errors: [{ code: 'verification_expired' }],
      };
      mockIsClerkAPIResponseError.mockReturnValue(true);

      const { isCodeExpired } = await import('@/lib/auth/clerk-errors');
      const result = isCodeExpired(clerkError);

      expect(result).toBe(true);
    });

    it('returns false for other error codes', async () => {
      const clerkError = {
        errors: [{ code: 'form_code_incorrect' }],
      };
      mockIsClerkAPIResponseError.mockReturnValue(true);

      const { isCodeExpired } = await import('@/lib/auth/clerk-errors');
      const result = isCodeExpired(clerkError);

      expect(result).toBe(false);
    });

    it('returns false for non-Clerk errors', async () => {
      mockIsClerkAPIResponseError.mockReturnValue(false);

      const { isCodeExpired } = await import('@/lib/auth/clerk-errors');
      const result = isCodeExpired(new Error('test'));

      expect(result).toBe(false);
    });
  });

  describe('isSessionExists', () => {
    it('returns true for session_exists', async () => {
      const clerkError = {
        errors: [{ code: 'session_exists' }],
      };
      mockIsClerkAPIResponseError.mockReturnValue(true);

      const { isSessionExists } = await import('@/lib/auth/clerk-errors');
      const result = isSessionExists(clerkError);

      expect(result).toBe(true);
    });

    it('returns false for other error codes', async () => {
      const clerkError = {
        errors: [{ code: 'form_identifier_not_found' }],
      };
      mockIsClerkAPIResponseError.mockReturnValue(true);

      const { isSessionExists } = await import('@/lib/auth/clerk-errors');
      const result = isSessionExists(clerkError);

      expect(result).toBe(false);
    });

    it('returns false for non-Clerk errors', async () => {
      mockIsClerkAPIResponseError.mockReturnValue(false);

      const { isSessionExists } = await import('@/lib/auth/clerk-errors');
      const result = isSessionExists(new Error('test'));

      expect(result).toBe(false);
    });
  });
});
