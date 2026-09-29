import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingChatEmptyIntro } from '@/components/features/onboarding/OnboardingChatEmptyIntro';
import { OnboardingShell } from '@/components/features/onboarding/OnboardingShell';
import { APP_ROUTES } from '@/constants/routes';

vi.mock('@/components/organisms/AppShellFrame', () => ({
  AppShellFrame: ({ main }: { readonly main: ReactNode }) => <>{main}</>,
}));

vi.mock('@/components/organisms/sidebar', () => ({
  SidebarProvider: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@/components/features/onboarding/OnboardingChat', () => ({
  OnboardingChat: ({
    turnstilePanel,
  }: {
    readonly turnstilePanel: ReactNode;
  }) => (
    <>
      <div data-testid='onboarding-chat' />
      {turnstilePanel}
    </>
  ),
}));

const turnstileProps = vi.hoisted(() => ({
  current: null as {
    readonly onStateChange?: (state: {
      status: string;
      message: string | null;
    }) => void;
  } | null,
}));

vi.mock('@/components/features/onboarding/OnboardingTurnstile', () => ({
  getBrowserTurnstileHostname: () => 'localhost',
  isOnboardingTurnstilePanelVisible: () => false,
  OnboardingTurnstile: (props: Record<string, unknown>) => {
    turnstileProps.current = props;
    return null;
  },
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

  it('hides sign-in after the server resolves an authenticated session', () => {
    render(<OnboardingShell sessionLabel='pending' isSignedIn />);

    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
  });

  it('reports a failed chat start without verification jargon or error codes', () => {
    render(<OnboardingShell sessionLabel='pending' />);

    expect(turnstileProps.current?.onStateChange).toBeTruthy();
    act(() => {
      turnstileProps.current?.onStateChange?.({
        status: 'error',
        message: null,
      });
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(
      "We couldn't start your chat. Refresh the page to try again."
    );
    expect(alert.textContent).not.toMatch(/verification failed|\(\d+\)/i);
  });

  it('removes the centered duplicate and starter rail from the blank entry', () => {
    render(<OnboardingChatEmptyIntro mode='blank' />);

    expect(screen.queryByText('Already have an account?')).toBeNull();
    expect(screen.queryByTestId('onboarding-sign-in-skip')).toBeNull();
    expect(screen.queryByTestId('onboarding-starter-suggestions')).toBeNull();
  });
});
