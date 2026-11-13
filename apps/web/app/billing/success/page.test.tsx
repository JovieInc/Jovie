import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  page: vi.fn(),
  track: vi.fn(),
  search: new URLSearchParams(),
  billing: { isPro: true, plan: 'pro' },
}));
vi.stubGlobal('fetch', mocks.fetch);
vi.mock('next/navigation', () => ({ useSearchParams: () => mocks.search }));
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));
vi.mock('@/lib/analytics', () => ({ page: mocks.page, track: mocks.track }));
vi.mock('@/lib/queries', () => ({
  useBillingStatusQuery: () => ({ data: mocks.billing }),
}));

import CheckoutSuccessPage from './page';
import {
  CHECKOUT_CONFIRMATION_ATTEMPTS,
  CHECKOUT_CONFIRMATION_INTERVAL_MS,
} from './use-checkout-confirmation';

const CONFIRMED = {
  status: 'confirmed',
  plan: 'pro',
  paymentStatus: 'paid',
  needsProfile: false,
  proofPending: false,
  profileShareUrl: null,
};
function response(body = CONFIRMED) {
  return { ok: true, status: 200, json: async () => body };
}

beforeEach(() => {
  mocks.fetch.mockReset().mockResolvedValue(response());
  mocks.page.mockReset();
  mocks.track.mockReset();
  mocks.search = new URLSearchParams('session_id=cs_test');
  mocks.billing = { isPro: true, plan: 'pro' };
});
afterEach(() => {
  vi.useRealTimers();
});

describe('checkout confirmation claims', () => {
  it.each(['pro', 'free'])(
    'direct navigation with %s cached billing never reports a new checkout',
    plan => {
      mocks.search = new URLSearchParams('plan_id=max');
      mocks.billing.plan = plan;
      render(<CheckoutSuccessPage />);
      expect(
        screen.getByTestId('checkout-success-recovery')
      ).toBeInTheDocument();
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.page).not.toHaveBeenCalled();
      expect(mocks.track).not.toHaveBeenCalled();
      expect(
        screen.getByRole('link', { name: 'View Billing' })
      ).toHaveAttribute('href', '/billing');
      expect(screen.queryByText('Payment confirmed')).not.toBeInTheDocument();
    }
  );

  it.each([
    { status: 'pending', plan: null },
    { status: 'unconfirmed', plan: 'pro' },
    { status: 'confirmed', plan: 'pro', paymentStatus: 'unpaid' },
    { plan: 'pro' },
  ])('never upgrades incomplete or old server evidence: %j', async payload => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    });
    render(<CheckoutSuccessPage />);
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(
      screen.queryByTestId('checkout-success-paid')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Payment confirmed')).not.toBeInTheDocument();
    expect(mocks.track).not.toHaveBeenCalled();
    expect(mocks.page).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: /retry checkout/i })
    ).not.toBeInTheDocument();
  });

  it.each(['pro', 'max'])(
    'uses a reconciled %s receipt, ignoring URL and stale shell billing',
    async plan => {
      mocks.search.set('plan_id', 'unsupported');
      mocks.billing = { plan: 'free', isPro: false };
      mocks.fetch.mockResolvedValue(response({ ...CONFIRMED, plan }));
      render(<CheckoutSuccessPage />);
      expect(
        await screen.findByTestId('checkout-success-paid')
      ).toBeInTheDocument();
      expect(screen.getByTestId('checkout-success-status')).toHaveTextContent(
        'Payment confirmed'
      );
      expect(screen.getByRole('heading')).toHaveTextContent(
        plan === 'pro' ? 'Artist Presence' : 'Max'
      );
      if (plan === 'pro') {
        expect(screen.getByText('Release emails')).toBeInTheDocument();
        expect(
          screen.getByRole('link', { name: /open your fan list/i })
        ).toHaveAttribute('href', '/app/contacts?tab=audience');
      } else {
        expect(
          screen.getByRole('link', { name: /view your releases/i })
        ).toHaveAttribute('href', '/app/releases');
      }
    }
  );

  it('describes a valid trial or zero-charge checkout without claiming a payment', async () => {
    mocks.fetch.mockResolvedValue(
      response({ ...CONFIRMED, paymentStatus: 'no_payment_required' })
    );
    render(<CheckoutSuccessPage />);
    expect(
      await screen.findByTestId('checkout-success-status')
    ).toHaveTextContent('Checkout confirmed — no payment due');
    expect(screen.queryByText('Payment confirmed')).not.toBeInTheDocument();
  });

  it('repeated visits report page views, never additional conversion events', async () => {
    const first = render(<CheckoutSuccessPage />);
    await screen.findByTestId('checkout-success-paid');
    first.unmount();
    render(<CheckoutSuccessPage />);
    await screen.findByTestId('checkout-success-paid');
    expect(
      screen.queryByText(/welcome to|just unlocked|live and upgraded/i)
    ).not.toBeInTheDocument();
    expect(mocks.page).toHaveBeenCalledTimes(2);
    expect(mocks.page).toHaveBeenCalledWith(
      'checkout_success',
      expect.objectContaining({ conversion: false })
    );
    expect(mocks.track).not.toHaveBeenCalledWith(
      'subscription_success',
      expect.anything()
    );
    expect(mocks.track).not.toHaveBeenCalledWith(
      'onboarding_upgrade_success',
      expect.anything()
    );
  });
});

describe('bounded recovery and interrupted navigation', () => {
  it('aborts an in-flight confirmation when leaving the page', () => {
    let signal: AbortSignal | undefined;
    mocks.fetch.mockImplementation((_url, options: { signal: AbortSignal }) => {
      signal = options.signal;
      return new Promise(() => {});
    });
    const mounted = render(<CheckoutSuccessPage />);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(signal?.aborted).toBe(false);
    mounted.unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('confirms checkout when AbortSignal.any is unavailable', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(AbortSignal, 'any');
    Object.defineProperty(AbortSignal, 'any', {
      value: undefined,
      configurable: true,
    });
    try {
      render(<CheckoutSuccessPage />);
      await waitFor(() =>
        expect(screen.getByTestId('checkout-success-paid')).toBeInTheDocument()
      );
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
    } finally {
      if (descriptor) Object.defineProperty(AbortSignal, 'any', descriptor);
      else Reflect.deleteProperty(AbortSignal, 'any');
    }
  });

  it('refreshes pending entitlement and stops after confirmation', async () => {
    vi.useFakeTimers();
    mocks.fetch.mockResolvedValueOnce(
      response({ ...CONFIRMED, status: 'pending' })
    );
    render(<CheckoutSuccessPage />);
    await act(async () => {});
    expect(screen.getByTestId('checkout-success-pending')).toBeInTheDocument();
    await act(() =>
      vi.advanceTimersByTimeAsync(CHECKOUT_CONFIRMATION_INTERVAL_MS)
    );
    expect(screen.getByTestId('checkout-success-paid')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('bounds 503 retries and offers a read retry, never a second purchase', async () => {
    vi.useFakeTimers();
    mocks.fetch.mockResolvedValue({ ok: false, status: 503 });
    render(<CheckoutSuccessPage />);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(mocks.fetch).toHaveBeenCalledTimes(CHECKOUT_CONFIRMATION_ATTEMPTS);
    expect(screen.getByTestId('checkout-success-recovery')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Check Again' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /retry checkout/i })
    ).not.toBeInTheDocument();
    mocks.fetch.mockResolvedValue(response());
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Check Again' }))
    );
    expect(screen.getByTestId('checkout-success-paid')).toBeInTheDocument();
  });

  it.each([404, 401])('does not retry a %s automatically', async status => {
    mocks.fetch.mockResolvedValue({ ok: false, status });
    render(<CheckoutSuccessPage />);
    await screen.findByTestId('checkout-success-recovery');
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('recovers from a network error with explicit retry', async () => {
    mocks.fetch.mockRejectedValueOnce(new Error('offline'));
    render(<CheckoutSuccessPage />);
    await screen.findByTestId('checkout-success-recovery');
    fireEvent.click(screen.getByRole('button', { name: 'Check Again' }));
    await screen.findByTestId('checkout-success-paid');
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('times out a stalled request without claiming success', async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementation(
      (_url, { signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        })
    );
    render(<CheckoutSuccessPage />);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(screen.getByTestId('checkout-success-recovery')).toBeInTheDocument();
  });

  it('discards a late prior-session result after navigation', async () => {
    let resolveOld!: (value: ReturnType<typeof response>) => void;
    mocks.fetch.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveOld = resolve;
        })
    );
    const mounted = render(<CheckoutSuccessPage />);
    mocks.search = new URLSearchParams('session_id=cs_new');
    mocks.fetch.mockResolvedValue({ ok: false, status: 404 });
    mounted.rerender(<CheckoutSuccessPage />);
    await screen.findByTestId('checkout-success-recovery');
    await act(async () => resolveOld(response()));
    expect(
      screen.queryByTestId('checkout-success-paid')
    ).not.toBeInTheDocument();
    expect(mocks.page).not.toHaveBeenCalled();
  });

  it('cancels pending polling when leaving the page', async () => {
    vi.useFakeTimers();
    mocks.fetch.mockResolvedValue(
      response({ ...CONFIRMED, status: 'pending' })
    );
    const mounted = render(<CheckoutSuccessPage />);
    await act(async () => {});
    mounted.unmount();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('profile claims and activation', () => {
  it.each([false, true])(
    'does not call a profile live merely because proofPending is %s',
    async proofPending => {
      mocks.search.set('source', 'onboarding');
      mocks.fetch.mockResolvedValue(response({ ...CONFIRMED, proofPending }));
      render(<CheckoutSuccessPage />);
      await screen.findByTestId('checkout-success-paid');
      expect(
        screen.queryByRole('heading', { name: /profile is live/i })
      ).not.toBeInTheDocument();
      expect(screen.getByRole('heading')).toHaveTextContent(
        'Your plan is active'
      );
    }
  );

  it('only calls a profile live and shares it when the server supplies its verified share link', async () => {
    mocks.search.set('source', 'onboarding');
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...CONFIRMED,
        profileShareUrl: 'https://jov.ie/artist',
      }),
    });
    render(<CheckoutSuccessPage />);
    await screen.findByTestId('paid-share-prompt');
    expect(screen.getByRole('heading')).toHaveTextContent(
      'Your profile is live'
    );
    expect(
      screen.getByRole('link', { name: /explore your dashboard/i })
    ).toHaveAttribute('href', '/app');
  });

  it('routes a buyer without a profile to claim and hides export', async () => {
    mocks.fetch.mockResolvedValue(
      response({ ...CONFIRMED, needsProfile: true })
    );
    render(<CheckoutSuccessPage />);
    expect(
      await screen.findByRole('link', { name: /claim your link/i })
    ).toHaveAttribute('href', '/start');
    expect(
      screen.queryByRole('link', { name: /open your fan list/i })
    ).not.toBeInTheDocument();
  });

  it('preserves the verification request and its confirmed result', async () => {
    render(<CheckoutSuccessPage />);
    fireEvent.click(
      await screen.findByRole('button', { name: /request verification/i })
    );
    await screen.findByRole('button', { name: 'Verification requested' });
    expect(mocks.fetch).toHaveBeenLastCalledWith('/api/verification/request', {
      method: 'POST',
    });
  });
});
