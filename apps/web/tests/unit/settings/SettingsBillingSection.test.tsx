import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsBillingSection } from '@/components/features/dashboard/organisms/SettingsBillingSection';
import { APP_ROUTES } from '@/constants/routes';

const {
  billingQueryState,
  mutateMock,
  pushMock,
  refetchMock,
  portalPendingState,
  portalErrorState,
} = vi.hoisted(() => ({
  billingQueryState: {
    data: null as null | {
      isPro: boolean;
      plan: string | null;
      hasStripeCustomer: boolean;
      stripeSubscriptionId: string | null;
      stale: boolean;
      staleReason: string | null;
    },
    isLoading: false,
    isError: false,
    isFetching: false,
  },
  mutateMock: vi.fn(),
  pushMock: vi.fn(),
  refetchMock: vi.fn(),
  portalPendingState: {
    isPending: false,
  },
  portalErrorState: {
    error: null as Error | null,
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock('@/lib/queries', () => ({
  useBillingStatusQuery: () => ({ ...billingQueryState, refetch: refetchMock }),
  usePortalMutation: () => ({
    mutate: mutateMock,
    isPending: portalPendingState.isPending,
    error: portalErrorState.error,
  }),
}));

describe('SettingsBillingSection', () => {
  beforeEach(() => {
    billingQueryState.data = null;
    billingQueryState.isLoading = false;
    billingQueryState.isError = false;
    billingQueryState.isFetching = false;
    refetchMock.mockReset();
    portalPendingState.isPending = false;
    portalErrorState.error = null;
    mutateMock.mockReset();
    pushMock.mockReset();
  });

  it('does not present a failed plan lookup as a free subscription', async () => {
    billingQueryState.isError = true;

    render(<SettingsBillingSection />);

    expect(
      screen.getByText('Billing unavailable', {
        selector: 'span:not([aria-hidden])',
      })
    ).toBeInTheDocument();
    expect(screen.queryByText('Free plan')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /compare plans/i })
    ).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /retry billing/i }));
    });
    expect(refetchMock).toHaveBeenCalledTimes(1);
    expect(mutateMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('keeps a failed cached refresh unavailable until retry confirms the plan', async () => {
    let finishRetry!: () => void;
    refetchMock.mockReturnValue(
      new Promise<void>(resolve => {
        finishRetry = resolve;
      })
    );
    billingQueryState.data = {
      isPro: true,
      plan: 'pro',
      hasStripeCustomer: true,
      stripeSubscriptionId: 'sub_123',
      stale: false,
      staleReason: null,
    };
    billingQueryState.isError = true;
    const { rerender } = render(<SettingsBillingSection />);
    const retry = screen.getByRole('button', { name: /retry billing/i });
    retry.focus();
    fireEvent.click(retry);
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /manage in stripe/i })
    ).not.toBeInTheDocument();

    billingQueryState.isFetching = true;
    rerender(<SettingsBillingSection />);
    expect(retry).toHaveAttribute('aria-disabled', 'true');
    expect(retry).not.toBeDisabled();
    expect(retry).toHaveAttribute('aria-busy', 'true');
    expect(retry).toHaveFocus();
    fireEvent.click(retry);
    expect(refetchMock).toHaveBeenCalledTimes(1);

    billingQueryState.isError = false;
    billingQueryState.isFetching = false;
    await act(async () => finishRetry());
    rerender(<SettingsBillingSection />);
    const manage = screen.getByRole('button', { name: /manage in stripe/i });
    expect(manage).toBe(retry);
    expect(manage).toHaveFocus();
    expect(screen.getByText('Artist Presence plan')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('renders the active plan summary with Stripe management access', () => {
    billingQueryState.data = {
      isPro: true,
      plan: 'pro',
      hasStripeCustomer: true,
      stripeSubscriptionId: 'sub_123',
      stale: false,
      staleReason: null,
    };

    render(<SettingsBillingSection />);

    expect(screen.getByText('Artist Presence plan')).toBeInTheDocument();
    const activeBadge = screen.getByText('Active');
    // Canonical Badge owns status color: no call-site palette restyle.
    expect(activeBadge).toHaveAttribute('data-variant', 'success');
    expect(activeBadge.className).not.toMatch(/emerald|amber|rounded-md/);
    expect(
      screen.getByText(
        'Open Stripe to manage invoices, payment methods, and subscription details.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /manage in stripe/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /manage in stripe/i }).closest('.px-4')
    ).toHaveClass('sm:px-5');
  });

  it('opens the billing portal for users who still have a Stripe customer record', () => {
    billingQueryState.data = {
      isPro: false,
      plan: null,
      hasStripeCustomer: true,
      stripeSubscriptionId: null,
      stale: false,
      staleReason: null,
    };

    render(<SettingsBillingSection />);

    fireEvent.click(screen.getByRole('button', { name: /manage in stripe/i }));

    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('routes new free users to the billing dashboard instead of the portal', () => {
    billingQueryState.data = {
      isPro: false,
      plan: null,
      hasStripeCustomer: false,
      stripeSubscriptionId: null,
      stale: false,
      staleReason: null,
    };

    render(<SettingsBillingSection />);

    fireEvent.click(screen.getByRole('button', { name: /compare plans/i }));

    expect(pushMock).toHaveBeenCalledWith(APP_ROUTES.BILLING);
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('surfaces cached billing state warnings inline', () => {
    billingQueryState.data = {
      isPro: true,
      plan: 'pro',
      hasStripeCustomer: true,
      stripeSubscriptionId: 'sub_123',
      stale: true,
      staleReason: 'Payment service temporarily unavailable',
    };

    render(<SettingsBillingSection />);

    expect(screen.getByText('Cached')).toBeInTheDocument();
    const staleReason = screen.getByText(
      'Payment service temporarily unavailable'
    );
    expect(staleReason.parentElement).toHaveClass('text-warning');
    expect(staleReason.parentElement?.className).not.toMatch(/amber/);
  });

  it('shows a canonical secondary Syncing badge while billing loads', () => {
    billingQueryState.isLoading = true;

    render(<SettingsBillingSection />);

    const syncingBadge = screen.getByText('Syncing');
    expect(syncingBadge).toHaveAttribute('data-variant', 'secondary');
    expect(syncingBadge.className).not.toMatch(/surface-0|rounded-md/);
  });
});
