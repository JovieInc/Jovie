import { describe, expect, it } from 'vitest';
import {
  createOnboardingError,
  mapDatabaseError,
  OnboardingErrorCode,
  onboardingErrorToError,
} from '@/lib/errors/onboarding';

describe('onboardingErrorToError', () => {
  it('embeds the error code in the message', () => {
    const onboardingError = createOnboardingError(
      OnboardingErrorCode.USERNAME_TAKEN,
      'Username is already taken'
    );

    const error = onboardingErrorToError(onboardingError);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('[USERNAME_TAKEN] Username is already taken');
  });

  it('works with errors mapped from database constraints', () => {
    const dbError = {
      code: '23505',
      message:
        'duplicate key value violates unique constraint "creator_profiles_username_normalized_unique_idx"',
    };

    const mapped = mapDatabaseError(dbError);
    const error = onboardingErrorToError(mapped);

    expect(error.message.startsWith('[USERNAME_TAKEN]')).toBe(true);
  });

  it('maps users email unique violations to EMAIL_IN_USE', () => {
    const dbError = {
      message: 'Failed query: SELECT create_profile_with_user(...)',
      cause: {
        code: '23505',
        constraint: 'idx_users_email_unique',
        message:
          'duplicate key value violates unique constraint "idx_users_email_unique"',
      },
    };

    const mapped = mapDatabaseError(dbError);

    expect(mapped.code).toBe(OnboardingErrorCode.EMAIL_IN_USE);
  });

  it('maps transaction rollbacks to TRANSACTION_FAILED', () => {
    const dbError = {
      message: 'Failed query: rollback',
      cause: {
        message: 'Transaction rolled back due to serialization failure',
      },
    };

    const mapped = mapDatabaseError(dbError);

    expect(mapped.code).toBe(OnboardingErrorCode.TRANSACTION_FAILED);
    expect(mapped.retryable).toBe(true);
    expect(mapped.message).toBe('Profile creation failed. Please try again');
  });
});
