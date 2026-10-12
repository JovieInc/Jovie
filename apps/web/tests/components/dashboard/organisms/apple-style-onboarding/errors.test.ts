import { describe, expect, it } from 'vitest';
import {
  extractErrorCode,
  isDatabaseError,
  mapErrorToUserMessage,
} from '@/features/dashboard/organisms/onboarding-v2/shared/errors';
import {
  createOnboardingReceiptPendingError,
  ONBOARDING_RECEIPT_PENDING_MESSAGE,
} from '@/lib/errors/onboarding';

describe('apple-style onboarding error helpers', () => {
  it('tells a saved-profile user to retry confirmation without implying rollback', () => {
    const cause = new Error('receipt write failed');
    const error = createOnboardingReceiptPendingError(cause);
    expect(error.cause).toBe(cause);
    expect(isDatabaseError(error)).toBe(false);
    expect(mapErrorToUserMessage(error, '/onboarding')).toEqual({
      userMessage: ONBOARDING_RECEIPT_PENDING_MESSAGE,
    });
  });

  it.each([
    new Error('[CLAIM_EXPIRED] private provider detail'),
    { message: '[CLAIM_EXPIRED] private provider detail' },
    '[CLAIM_EXPIRED]',
  ])('maps expired claims to fixed recovery copy', error => {
    expect(mapErrorToUserMessage(error, '/onboarding')).toEqual({
      userMessage:
        'This claim link has expired or is no longer valid. Please request a new claim link.',
    });
  });

  it('keeps unknown private errors generic', () => {
    expect(
      mapErrorToUserMessage(new Error('private provider detail'), '/onboarding')
    ).toEqual({
      userMessage: 'Could not save. Please try again.',
    });
  });

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
