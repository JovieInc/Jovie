import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { getOrMintOnboardingSessionIdMock } = vi.hoisted(() => ({
  getOrMintOnboardingSessionIdMock: vi.fn(),
}));

vi.mock('@/components/features/onboarding/OnboardingShell', () => ({
  OnboardingShell: ({ sessionLabel }: { readonly sessionLabel: string }) => (
    <div data-session-label={sessionLabel} data-testid='onboarding-shell' />
  ),
}));

vi.mock('@/lib/onboarding/session', () => ({
  getOrMintOnboardingSessionId: getOrMintOnboardingSessionIdMock,
}));

describe('/start page', () => {
  it('renders the chat shell without minting an onboarding cookie', async () => {
    const { default: StartPage } = await import('@/app/(dynamic)/start/page');

    render(await StartPage());

    expect(screen.getByTestId('onboarding-shell')).toHaveAttribute(
      'data-session-label',
      'pending'
    );
    expect(getOrMintOnboardingSessionIdMock).not.toHaveBeenCalled();
  });
});
