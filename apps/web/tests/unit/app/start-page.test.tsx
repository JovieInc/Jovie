import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { getOrMintOnboardingSessionIdMock, resolveUserStateMock } = vi.hoisted(
  () => ({
    getOrMintOnboardingSessionIdMock: vi.fn(),
    resolveUserStateMock: vi.fn().mockResolvedValue({
      state: 'UNAUTHENTICATED',
      redirectTo: '/signin',
    }),
  })
);

vi.mock('@/components/features/onboarding/OnboardingShell', () => ({
  OnboardingShell: ({ sessionLabel }: { readonly sessionLabel: string }) => (
    <div data-session-label={sessionLabel} data-testid='onboarding-shell' />
  ),
}));

vi.mock('@/lib/onboarding/session', () => ({
  getOrMintOnboardingSessionId: getOrMintOnboardingSessionIdMock,
}));

// The /start page resolves canonical access state server-side via
// `resolveUserState` (Clerk `auth()` → `server-only`). Mock the gate so the
// page module can be imported in the jsdom unit environment.
vi.mock('@/lib/auth/gate', () => ({
  resolveUserState: resolveUserStateMock,
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
