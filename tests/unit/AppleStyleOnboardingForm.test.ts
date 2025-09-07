import { describe, expect, it } from 'vitest';
import { ONBOARDING_STEPS } from '@/components/dashboard/organisms/AppleStyleOnboardingForm';

describe('AppleStyleOnboardingForm copy', () => {
  it('matches the expected onboarding step copy', () => {
    expect(ONBOARDING_STEPS).toEqual([
      {
        id: 'welcome',
        title: 'Launch your profile in moments.',
        prompt: "Three quick steps and you're live.",
      },
      {
        id: 'name',
        title: 'Your name, your signature.',
        prompt: 'Displayed on your Jovie profile.',
      },
      {
        id: 'handle',
        title: 'Claim your @handle.',
        prompt: 'This becomes your unique link.',
      },
      {
        id: 'done',
        title: "You're live.",
        prompt: 'Your link is ready to share.',
      },
    ]);
  });
});
