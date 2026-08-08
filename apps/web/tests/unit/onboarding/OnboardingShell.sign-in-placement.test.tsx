import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingChatEmptyIntro } from '@/components/features/onboarding/OnboardingChatEmptyIntro';
import { OnboardingShell } from '@/components/features/onboarding/OnboardingShell';
import { APP_ROUTES } from '@/constants/routes';

vi.mock('@/components/organisms/AppShellFrame', () => ({
  AppShellFrame: ({ main }: { readonly main: ReactNode }) => <>{main}</>,
}));

vi.mock('@/components/organisms/Sidebar', () => ({
  SidebarProvider: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@/components/features/onboarding/OnboardingChat', () => ({
  OnboardingChat: () => <div data-testid='onboarding-chat' />,
}));

vi.mock('@/components/features/onboarding/OnboardingTurnstile', () => ({
  getBrowserTurnstileHostname: () => 'localhost',
  isOnboardingTurnstilePanelVisible: () => false,
  OnboardingTurnstile: () => null,
  resolveTurnstileSiteKey: () => null,
}));

vi.mock('@/components/features/onboarding/useOnboardingClaim', () => ({
  useOnboardingClaim: () => 'idle',
}));

describe('onboarding sign-in placement', () => {
  it('anchors the quiet sign-in link in an absolute top-right header slot', () => {
    render(<OnboardingShell sessionLabel='pending' />);

    const header = screen.getByTestId('onboarding-sign-in-header');
    expect(header).toHaveClass('absolute', 'right-3', 'top-3');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      APP_ROUTES.SIGNIN
    );
  });

  it('removes the centered duplicate and starter rail from the blank entry', () => {
    render(<OnboardingChatEmptyIntro mode='blank' />);

    expect(screen.queryByText('Already have an account?')).toBeNull();
    expect(screen.queryByTestId('onboarding-sign-in-skip')).toBeNull();
    expect(screen.queryByTestId('onboarding-starter-suggestions')).toBeNull();
  });
});
