import { describe, expect, it } from 'vitest';
import {
  createOnboardingError,
  mapDatabaseError,
  OnboardingErrorCode,
  onboardingErrorToError,
} from '../onboarding';

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
});
