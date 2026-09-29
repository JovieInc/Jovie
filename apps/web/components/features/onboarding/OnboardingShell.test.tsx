import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingShell } from './OnboardingShell';

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
  useOnboardingClaim: () => 'error',
}));

describe('OnboardingShell status', () => {
  it('renders the claim-error status with the error token, not raw red-* (JOV-6773)', () => {
    render(<OnboardingShell sessionLabel='pending' />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(
      "We couldn't save your request. Refresh this page to try again."
    );
    expect(alert.className).toContain('border-error/20');
    expect(alert.className).toContain('text-error');
    expect(alert.className).not.toMatch(/\bred-\d/);
  });

  it('reports a failed chat start without verification jargon or error codes', () => {
    render(<OnboardingShell sessionLabel='pending' />);

    act(() => {
      turnstileProps.current?.onStateChange?.({
        status: 'error',
        message: null,
      });
    });

    const alert = screen.getByText(
      "We couldn't start your chat. Refresh the page to try again."
    );
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert.textContent).not.toMatch(/verification failed|\(\d+\)/i);
  });
});
