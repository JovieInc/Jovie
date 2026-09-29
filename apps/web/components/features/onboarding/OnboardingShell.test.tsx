import { render, screen } from '@testing-library/react';
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
  OnboardingChat: () => <div data-testid='onboarding-chat' />,
}));

vi.mock('@/components/features/onboarding/OnboardingTurnstile', () => ({
  getBrowserTurnstileHostname: () => 'localhost',
  isOnboardingTurnstilePanelVisible: () => false,
  OnboardingTurnstile: () => null,
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
});
