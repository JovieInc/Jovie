import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fetchMock,
  pageMock,
  trackMock,
  useBillingStatusQueryMock,
  searchParamsMock,
} = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  pageMock: vi.fn(),
  trackMock: vi.fn(),
  useBillingStatusQueryMock: vi.fn(),
  searchParamsMock: vi.fn(() => new URLSearchParams()),
}));

vi.stubGlobal('fetch', fetchMock);

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock(),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    readonly children: React.ReactNode;
    readonly href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock('@/components/atoms/Confetti', () => ({
  ConfettiOverlay: (props: { readonly viewport?: boolean }) => (
    <div
      data-testid='confetti-overlay'
      data-viewport={props.viewport ? 'true' : 'false'}
    />
  ),
}));

vi.mock('@/components/molecules/UpgradeButton', () => ({
  UpgradeButton: ({ children }: { readonly children?: string }) => (
    <button type='button'>{children}</button>
  ),
}));

vi.mock('@/lib/analytics', () => ({
  page: pageMock,
  track: trackMock,
}));

vi.mock('@/lib/queries', () => ({
  useBillingStatusQuery: useBillingStatusQueryMock,
}));

import CheckoutSuccessPage from './page';

function setSearchParams(query: string) {
  searchParamsMock.mockReturnValue(new URLSearchParams(query));
}

function mockBilling(
  plan: string | null,
  opts: { readonly isPro?: boolean; readonly isLoading?: boolean } = {}
) {
  const derivedIsPro = plan === 'pro' || plan === 'max' || plan === 'trial';
  const isLoading = opts.isLoading ?? false;
  useBillingStatusQueryMock.mockReturnValue({
    data: isLoading
      ? undefined
      : {
          isPro: opts.isPro ?? derivedIsPro,
          plan,
        },
    isLoading,
    isFetched: !isLoading,
    error: null,
  });
}

function mockValidatedSessionPlan(
  plan: string | null,
  ok = true,
  extras: Record<string, unknown> = {}
) {
  fetchMock.mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: vi.fn().mockResolvedValue({
      status: plan ? 'confirmed' : 'unconfirmed',
      plan,
      paymentStatus: plan ? 'paid' : null,
      ...extras,
    }),
  });
}

function showConfirmedPlan(plan: string, query?: string) {
  setSearchParams(query ?? `session_id=cs_test&plan_id=${plan}`);
  mockValidatedSessionPlan(plan);
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolver => {
    resolve = resolver;
  });

  return { promise, resolve };
}

describe('CheckoutSuccessPage — analytics and shell', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    pageMock.mockReset();
    trackMock.mockReset();
    useBillingStatusQueryMock.mockReset();
    searchParamsMock.mockReset();
    searchParamsMock.mockReturnValue(new URLSearchParams());
  });

  it('emits subscription_success + checkout_success only after the session is confirmed', async () => {
    showConfirmedPlan('pro');
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    await screen.findByTestId('checkout-success-paid');
    await waitFor(() => {
      expect(trackMock).toHaveBeenCalledWith(
        'subscription_success',
        expect.any(Object)
      );
      expect(pageMock).toHaveBeenCalledWith(
        'checkout_success',
        expect.objectContaining({ conversion: true })
      );
    });
  });

  it('does not emit conversion analytics for a session plan that is not confirmed', async () => {
    setSearchParams('session_id=cs_test&plan_id=pro');
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        status: 'pending',
        plan: 'pro',
        paymentStatus: 'paid',
      }),
    });
    mockBilling(null);
    const view = render(<CheckoutSuccessPage />);
    expect(
      await screen.findByTestId('checkout-success-pending')
    ).toBeInTheDocument();
    expect(trackMock).not.toHaveBeenCalledWith(
      'subscription_success',
      expect.any(Object)
    );
    expect(pageMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('confetti-overlay')).not.toBeInTheDocument();
    view.unmount();
  });

  it('emits checkout_celebration_shown with the validated canonical planType', async () => {
    setSearchParams('session_id=cs_test&plan_id=growth'); // legacy alias -> max
    mockValidatedSessionPlan('max');
    mockBilling(null);
    render(<CheckoutSuccessPage />);
    await waitFor(() => {
      expect(trackMock).toHaveBeenCalledWith('checkout_celebration_shown', {
        planType: 'max',
      });
    });
  });

  it('emits checkout_celebration_shown once when billing and session plans differ', async () => {
    const deferredPlan = createDeferred<{
      ok: true;
      json: () => Promise<{ plan: string }>;
    }>();

    setSearchParams('session_id=cs_test&plan_id=max');
    fetchMock.mockReturnValue(deferredPlan.promise);
    mockBilling('pro');
    render(<CheckoutSuccessPage />);

    expect(trackMock).not.toHaveBeenCalledWith('checkout_celebration_shown', {
      planType: 'pro',
    });
    expect(trackMock).not.toHaveBeenCalledWith(
      'subscription_success',
      expect.any(Object)
    );
    expect(screen.getByTestId('checkout-success-pending')).toBeInTheDocument();

    deferredPlan.resolve({
      ok: true,
      json: async () => ({
        status: 'confirmed',
        plan: 'max',
        paymentStatus: 'paid',
      }),
    });

    await waitFor(() => {
      expect(trackMock).toHaveBeenCalledWith('checkout_celebration_shown', {
        planType: 'max',
      });
    });
    expect(
      trackMock.mock.calls.filter(
        ([event]) => event === 'checkout_celebration_shown'
      )
    ).toHaveLength(1);
  });

  it('settles in place on verified paid success: no confetti, a status pill and the billing link', async () => {
    showConfirmedPlan('pro');
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(screen.queryByTestId('confetti-overlay')).not.toBeInTheDocument();
    expect(
      await screen.findByTestId('checkout-success-status')
    ).toHaveTextContent('Payment confirmed');
    expect(screen.getByRole('link', { name: 'Billing page' })).toHaveAttribute(
      'href',
      '/billing'
    );
    expect(
      screen
        .getByTestId('checkout-success-paid')
        .querySelector('.translate-y-6')
    ).toBeNull();
  });

  it('does not declare paid success when checkout-session fetch fails', async () => {
    setSearchParams('session_id=cs_test&plan_id=pro');
    mockValidatedSessionPlan(null, false);
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(
      await screen.findByTestId('checkout-success-recovery')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /welcome to your new plan/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('confetti-overlay')).not.toBeInTheDocument();
    expect(trackMock).not.toHaveBeenCalledWith(
      'subscription_success',
      expect.any(Object)
    );
    expect(
      screen.getByRole('button', { name: /check again/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view billing/i })).toHaveAttribute(
      'href',
      '/billing'
    );
    expect(
      screen.queryByRole('button', { name: /retry checkout/i })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go home/i })).toHaveAttribute(
      'href',
      '/'
    );
  });

  it('keeps direct navigation in recovery with no conversion events while billing is still loading', () => {
    mockBilling(null, { isLoading: true });
    render(<CheckoutSuccessPage />);
    expect(screen.getByTestId('checkout-success-recovery')).toBeInTheDocument();
    expect(
      screen.queryByTestId('checkout-success-pending')
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('confetti-overlay')).not.toBeInTheDocument();
    expect(pageMock).not.toHaveBeenCalled();
    expect(trackMock).not.toHaveBeenCalledWith(
      'subscription_success',
      expect.any(Object)
    );
  });
});
