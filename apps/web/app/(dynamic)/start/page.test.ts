import { describe, expect, it, vi } from 'vitest';

// OnboardingShell is a UI component we don't need to render in this test.
vi.mock('@/components/features/onboarding/OnboardingShell', () => ({
  OnboardingShell: () => null,
}));

import StartPage from './page';

describe('StartPage', () => {
  it('renders the onboarding shell without minting a server-component cookie', async () => {
    const result = await StartPage({ searchParams: Promise.resolve({}) });

    expect(result).toMatchObject({
      props: {
        sessionLabel: 'pending',
      },
    });
  });

  it('passes homepage intent and starter prompt params into the shell', async () => {
    const result = await StartPage({
      searchParams: Promise.resolve({
        intent_id: 'intent-1',
        starter_prompt: "hey, I'm David Guetta. show me my Spotify.",
      }),
    });

    expect(result).toMatchObject({
      props: {
        intentId: 'intent-1',
        sessionLabel: 'pending',
        starterPrompt: "hey, I'm David Guetta. show me my Spotify.",
      },
    });
  });
});
