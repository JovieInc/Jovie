import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsBillingSection } from '@/components/features/dashboard/organisms/SettingsBillingSection';
import { APP_ROUTES } from '@/constants/routes';

const {
  billingQueryState,
  mutateMock,
  pushMock,
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
  },
  mutateMock: vi.fn(),
  pushMock: vi.fn(),
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
  useBillingStatusQuery: () => billingQueryState,
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
    portalPendingState.isPending = false;
    portalErrorState.error = null;
    mutateMock.mockReset();
    pushMock.mockReset();
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

    expect(screen.getByText('Pro plan')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Manage invoices, payment methods, and subscription details without leaving the app.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /manage in stripe/i })
    ).toBeInTheDocument();
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
    expect(
      screen.getByText('Payment service temporarily unavailable')
    ).toBeInTheDocument();
  });
});
