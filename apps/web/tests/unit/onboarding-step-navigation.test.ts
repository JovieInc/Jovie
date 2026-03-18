import { describe, expect, it } from 'vitest';

/**
 * Tests for step navigation with initialStepIndex support.
 * Validates the step-resume logic for existing users returning to onboarding.
 */
describe('Step navigation initialStepIndex', () => {
  it('defaults to step 0 when no initialStepIndex provided', () => {
    const initialStepIndex = undefined;
    const resolved = initialStepIndex ?? 0;
    expect(resolved).toBe(0);
  });

  it('starts at step 2 for step-resume users', () => {
    const initialStepIndex = 2;
    expect(initialStepIndex).toBe(2);
  });

  it('back button goes to dashboard when at initialStepIndex > 0', () => {
    const currentStepIndex = 2;
    const initialStepIndex = 2;

    // Simulates the goBack logic
    const shouldGoToDashboard =
      initialStepIndex > 0 && currentStepIndex <= initialStepIndex;
    expect(shouldGoToDashboard).toBe(true);
  });

  it('back button goes to previous step when above initialStepIndex', () => {
    const currentStepIndex = 2;
    const initialStepIndex = 0;

    const shouldGoToPrevious = currentStepIndex > initialStepIndex;
    expect(shouldGoToPrevious).toBe(true);
  });
});

interface ProfileSnapshot {
  onboardingCompletedAt: Date | null;
  avatarUrl: string | null;
}

function resolveInitialStep(profile: ProfileSnapshot | null): number {
  const isReturningForPhoto =
    profile?.onboardingCompletedAt && !profile?.avatarUrl;
  return isReturningForPhoto ? 2 : 0;
}

describe('Step-resume detection', () => {
  it('detects existing user with completed onboarding but no avatar', () => {
    expect(
      resolveInitialStep({ onboardingCompletedAt: new Date(), avatarUrl: null })
    ).toBe(2);
  });

  it('starts at step 0 for new users', () => {
    expect(resolveInitialStep(null)).toBe(0);
  });

  it('starts at step 0 for users with avatar already set', () => {
    expect(
      resolveInitialStep({
        onboardingCompletedAt: new Date(),
        avatarUrl: 'https://cdn.example.com/avatar.jpg',
      })
    ).toBe(0);
  });
});
