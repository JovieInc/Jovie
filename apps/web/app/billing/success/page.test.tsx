import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { pageMock, trackMock, useBillingStatusQueryMock, useSearchParamsMock } =
  vi.hoisted(() => ({
    pageMock: vi.fn(),
    trackMock: vi.fn(),
    useBillingStatusQueryMock: vi.fn(),
    useSearchParamsMock: vi.fn(),
  }));

vi.mock('next/navigation', () => ({
  useSearchParams: useSearchParamsMock,
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: ComponentProps<'div'>) => (
      <div {...props}>{children}</div>
    ),
  },
  useReducedMotion: () => false,
}));

vi.mock('@/lib/analytics', () => ({
  page: pageMock,
  track: trackMock,
}));

vi.mock('@/lib/queries', () => ({
  useBillingStatusQuery: useBillingStatusQueryMock,
}));

import CheckoutSuccessPage from './page';

describe('billing success page', () => {
  beforeEach(() => {
    pageMock.mockReset();
    trackMock.mockReset();
    useBillingStatusQueryMock.mockReset();
    useSearchParamsMock.mockReset();

    useSearchParamsMock.mockReturnValue(new URLSearchParams('plan_id=pro'));
    useBillingStatusQueryMock.mockReturnValue({
      data: {
        isPro: true,
        plan: 'pro',
      },
      status: 'success',
    });
  });

  it('uses the Stripe plan hint for the Pro headline and next-step CTAs', () => {
    render(<CheckoutSuccessPage />);
    const pageShell = screen.getByRole('main');

    expect(
      screen.getByRole('heading', { name: 'Welcome to Pro' })
    ).toBeInTheDocument();
    expect(pageShell.className).toContain('overflow-y-auto');
    expect(pageShell.className).not.toContain('overflow-hidden');
    expect(screen.getByRole('link', { name: 'Open Chat' })).toHaveAttribute(
      'href',
      '/app/chat'
    );
    expect(screen.getByRole('link', { name: 'View Releases' })).toHaveAttribute(
      'href',
      '/app/dashboard/releases'
    );
    expect(pageMock).toHaveBeenCalledWith(
      'checkout_success',
      expect.any(Object)
    );
    expect(trackMock).toHaveBeenCalledWith(
      'subscription_success',
      expect.any(Object)
    );
    expect(trackMock).toHaveBeenCalledWith('checkout_celebration_shown', {
      planType: 'pro',
    });
  });

  it('renders registry-backed unlock tiles for Max', () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams('plan_id=max'));
    useBillingStatusQueryMock.mockReturnValue({
      data: {
        isPro: true,
        plan: 'max',
      },
      status: 'success',
    });

    render(<CheckoutSuccessPage />);

    expect(
      screen.getByRole('heading', { name: 'Welcome to Max' })
    ).toBeInTheDocument();
    expect(screen.getByText('Release plan generation')).toBeInTheDocument();
    expect(screen.getByText('Metadata submission agent')).toBeInTheDocument();
    expect(screen.getByText('Unlimited analytics')).toBeInTheDocument();
  });

  it('prefers the Stripe plan hint when it disagrees with billing status', () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams('plan_id=max'));
    useBillingStatusQueryMock.mockReturnValue({
      data: {
        isPro: true,
        plan: 'pro',
      },
      status: 'success',
    });

    render(<CheckoutSuccessPage />);

    expect(
      screen.getByRole('heading', { name: 'Welcome to Max' })
    ).toBeInTheDocument();
    expect(trackMock).toHaveBeenCalledWith('checkout_celebration_shown', {
      planType: 'max',
    });
  });

  it('falls back to a generic celebration when the plan hint is invalid', () => {
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams('plan_id=definitely-not-a-plan')
    );
    useBillingStatusQueryMock.mockReturnValue({
      data: {
        isPro: true,
        plan: 'max',
      },
      status: 'success',
    });

    render(<CheckoutSuccessPage />);

    expect(
      screen.getByRole('heading', { name: 'Welcome to your new plan' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Welcome to Max' })
    ).not.toBeInTheDocument();
    expect(trackMock).toHaveBeenCalledWith('checkout_celebration_shown', {
      planType: 'generic',
    });
  });

  it('waits for billing status before resolving a missing plan hint', () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
    useBillingStatusQueryMock.mockReturnValue({
      data: undefined,
      status: 'pending',
    });

    const { rerender } = render(<CheckoutSuccessPage />);

    expect(
      screen.queryByRole('heading', { name: /Welcome to/i })
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('billing-success-skeleton')).toBeInTheDocument();

    useBillingStatusQueryMock.mockReturnValue({
      data: {
        isPro: true,
        plan: 'pro',
      },
      status: 'success',
    });

    rerender(<CheckoutSuccessPage />);

    expect(
      screen.getByRole('heading', { name: 'Welcome to Pro' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Welcome to your new plan' })
    ).not.toBeInTheDocument();
  });
});
