import { describe, expect, it, vi } from 'vitest';

// OnboardingShell is a UI component we don't need to render in this test.
vi.mock('@/components/features/onboarding/OnboardingShell', () => ({
  OnboardingShell: () => null,
}));

import StartPage from './page';

describe('StartPage', () => {
  it('renders the onboarding shell without minting a server-component cookie', async () => {
    const result = await StartPage();

    expect(result).toMatchObject({
      props: {
        sessionLabel: 'pending',
      },
    });
  });
});
