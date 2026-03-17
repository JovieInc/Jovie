import { describe, expect, it } from 'vitest';
import {
  getOnboardingCompletionMethod,
  getValidationFailureKey,
  toDurationMs,
} from '@/features/dashboard/organisms/apple-style-onboarding/analytics';

describe('apple-style onboarding analytics helpers', () => {
  it('returns non-negative durations', () => {
    expect(toDurationMs(1_000, 1_450)).toBe(450);
    expect(toDurationMs(1_450, 1_000)).toBe(0);
  });

  it('maps completion method correctly', () => {
    expect(getOnboardingCompletionMethod(true)).toBe('auto');
    expect(getOnboardingCompletionMethod(false)).toBe('manual');
  });

  it('builds stable validation failure keys', () => {
    expect(getValidationFailureKey('artistname', 'Handle already taken')).toBe(
      'artistname:Handle already taken'
    );
  });
});
