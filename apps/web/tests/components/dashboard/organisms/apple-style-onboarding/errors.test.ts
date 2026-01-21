import { describe, expect, it } from 'vitest';
import {
  extractErrorCode,
  isDatabaseError,
  mapErrorToUserMessage,
} from '@/components/dashboard/organisms/apple-style-onboarding/errors';

describe('apple-style onboarding error helpers', () => {
  it('extracts error codes even when prefixed by Error:', () => {
    const error = new Error(
      'Error: [DATABASE_ERROR] Database operation failed'
    );

    expect(extractErrorCode(error)).toBe('DATABASE_ERROR');
  });

  it('returns a refined message for database failures', () => {
    const error = new Error('[DATABASE_ERROR] Database operation failed');

    const result = mapErrorToUserMessage(error, '/onboarding');

    expect(result.userMessage).toBe(
      "We couldn't finish setting up your account. Please try again in a moment."
    );
  });

  it('treats bracketed database errors as retryable database failures', () => {
    const error = new Error('Error: [TRANSACTION_FAILED] Transaction aborted');

    expect(isDatabaseError(error)).toBe(true);
  });
});
