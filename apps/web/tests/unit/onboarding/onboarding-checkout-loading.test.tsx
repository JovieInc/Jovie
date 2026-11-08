import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/organisms/AppShellFrame', () => ({
  AppShellFrame: ({ main }: { readonly main?: ReactNode }) => (
    <div data-testid='app-shell-frame'>{main}</div>
  ),
}));

vi.mock('@/components/organisms/sidebar', () => ({
  SidebarProvider: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));

import OnboardingCheckoutLoading from '@/app/onboarding/checkout/loading';

describe('onboarding checkout loading state', () => {
  it('draws the checkout frame and scroll box, not the auth page skeleton', () => {
    render(<OnboardingCheckoutLoading />);

    const frame = screen.getByTestId('app-shell-frame');
    const scroll = screen.getByTestId('onboarding-checkout-scroll');
    expect(frame).toContainElement(scroll);
    expect(scroll).toContainElement(
      screen.getByTestId('onboarding-checkout-loading')
    );
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  it('mirrors the plan highlights card with one row per highlight', () => {
    const { container } = render(<OnboardingCheckoutLoading />);

    expect(
      container.querySelectorAll(
        '[data-testid="checkout-loading-highlights"] > div'
      )
    ).toHaveLength(3);
  });
});
