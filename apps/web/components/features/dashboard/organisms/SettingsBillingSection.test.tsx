import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SettingsBillingSection } from './SettingsBillingSection';

type Billing = {
  isPro: boolean;
  plan: string | null;
  hasStripeCustomer: boolean;
  stripeSubscriptionId: string | null;
  stale: boolean;
  staleReason: string | null;
  trialEndsAt?: string | null;
};

const { state, mutateMock, pushMock, refetchMock } = vi.hoisted(() => ({
  state: {
    data: null as Billing | null,
    isLoading: false,
    isError: false,
    isFetching: false,
    portalError: null as Error | null,
  },
  mutateMock: vi.fn(),
  pushMock: vi.fn(),
  refetchMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/lib/queries', () => ({
  useBillingStatusQuery: () => ({
    data: state.data,
    isLoading: state.isLoading,
    isError: state.isError,
    isFetching: state.isFetching,
    refetch: refetchMock,
  }),
  usePortalMutation: () => ({
    mutate: mutateMock,
    isPending: false,
    error: state.portalError,
  }),
}));

const pro: Billing = {
  isPro: true,
  plan: 'pro',
  hasStripeCustomer: true,
  stripeSubscriptionId: 'sub_1',
  stale: false,
  staleReason: null,
};

beforeEach(() => {
  state.data = null;
  state.isLoading = false;
  state.isError = false;
  state.isFetching = false;
  state.portalError = null;
  mutateMock.mockReset();
  pushMock.mockReset();
  refetchMock.mockReset();
});

describe('SettingsBillingSection certificate', () => {
  it('opens the Stripe portal for a paying customer', async () => {
    const user = userEvent.setup();
    state.data = pro;
    const { container } = render(<SettingsBillingSection />);

    expect(screen.getByText('Active')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Manage in Stripe/ }));
    expect(mutateMock).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(pushMock).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('sends a customer without Stripe to the plans page', async () => {
    const user = userEvent.setup();
    state.data = {
      ...pro,
      isPro: false,
      plan: 'free',
      hasStripeCustomer: false,
      stripeSubscriptionId: null,
    };
    const { container } = render(<SettingsBillingSection />);

    expect(screen.getByText('Free plan')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Compare plans/ }));
    expect(pushMock).toHaveBeenCalledWith(APP_ROUTES.BILLING);
    expect(mutateMock).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('retries the status query when billing is unavailable', async () => {
    const user = userEvent.setup();
    state.isError = true;
    refetchMock.mockResolvedValue({});
    const { container } = render(<SettingsBillingSection />);

    expect(
      screen.getByText("We couldn't load your plan. Try again.")
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Retry billing/ }));
    expect(refetchMock).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('ignores clicks while the status is still loading', async () => {
    const user = userEvent.setup();
    state.isLoading = true;
    const { container } = render(<SettingsBillingSection />);

    expect(screen.getByText('Loading billing')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Compare plans/ }));
    expect(refetchMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('shows a long cached warning and the portal error', async () => {
    const reason =
      'Stripe is temporarily unavailable, so this shows the plan we last confirmed. Invoices and payment methods will return when it recovers.';
    state.data = { ...pro, stale: true, staleReason: reason };
    state.portalError = new Error('Could not open the billing portal');
    const { container } = render(<SettingsBillingSection />);

    expect(screen.getByText('Cached')).toBeInTheDocument();
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(
      screen.getByText('Could not open the billing portal')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders inside an RTL document', async () => {
    state.data = pro;
    const { container } = render(
      <div dir='rtl'>
        <SettingsBillingSection />
      </div>
    );
    expect(
      screen.getByRole('button', { name: /Manage in Stripe/ })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
