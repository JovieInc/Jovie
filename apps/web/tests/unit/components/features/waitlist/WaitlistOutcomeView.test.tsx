import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const checkout = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  isError: false,
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ signOut: vi.fn() }),
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
const priceLock = vi.hoisted(() => ({
  data: null as null | {
    locked: true;
    priceVersionId: string;
    lockedAt: string;
    month: {
      amountCents: number;
      currency: string;
      interval: 'month';
      priceId: string;
    } | null;
    year: null;
  },
}));
vi.mock('@/lib/queries', () => ({
  useCheckoutMutation: () => checkout,
  usePriceLockQuery: () => priceLock,
}));

const LOCK_12 = {
  locked: true as const,
  priceVersionId: 'pro-2026-10-20-m12',
  lockedAt: '2026-10-29T00:00:00.000Z',
  month: {
    amountCents: 1200,
    currency: 'usd',
    interval: 'month' as const,
    priceId: 'price_12',
  },
  year: null,
};

import { WaitlistOutcomeView } from '@/components/features/waitlist/WaitlistOutcomeView';

describe('WaitlistOutcomeView pending receipt', () => {
  it('claims jov.ie/<handle> is reserved only when a held handle is passed', () => {
    render(
      <WaitlistOutcomeView
        outcome='pending'
        email='artist@example.com'
        reservedHandle='coolartist'
      />
    );

    expect(
      screen.getByText(/jov\.ie\/coolartist is yours/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/reserved/i)).toBeInTheDocument();
  });

  it('falls back to generic saved copy when no handle was reserved', () => {
    render(
      <WaitlistOutcomeView outcome='pending' email='artist@example.com' />
    );

    expect(screen.getByText(/request is saved/i)).toBeInTheDocument();
    expect(screen.queryByText(/jov\.ie\//)).not.toBeInTheDocument();
  });
});

describe('WaitlistOutcomeView Start Pro (JOV-7701: anyone can buy)', () => {
  it.each([
    ['a reserved handle', 'coolartist'],
    ['no link', null],
  ])('offers Start Pro on the pending receipt with %s', (_label, handle) => {
    checkout.mutate.mockClear();
    priceLock.data = LOCK_12;
    render(
      <WaitlistOutcomeView
        outcome='pending'
        reservedHandle={handle}
        proCheckoutPriceId='price_pro_monthly'
      />
    );

    const cta = screen.getByTestId('waitlist-start-pro-checkout');
    // The price is the person's own locked price, not a list-price constant.
    expect(cta).toHaveTextContent('Start Pro ($12/mo)');
    expect(screen.getByTestId('price-lock-note')).toHaveTextContent(
      'Your price is locked at $12/mo.'
    );
    fireEvent.click(cta);
    // Default checkout: no onboarding source, so success lands on
    // /billing/success and routes a link-less buyer to /start.
    expect(checkout.mutate).toHaveBeenCalledWith(
      { priceId: 'price_pro_monthly' },
      expect.any(Object)
    );
    expect(screen.getByTestId('waitlist-resume-start')).toBeInTheDocument();
  });

  it('shows no price (never the list price) until the lock has loaded', () => {
    priceLock.data = null;
    render(
      <WaitlistOutcomeView
        outcome='pending'
        proCheckoutPriceId='price_pro_monthly'
      />
    );
    const cta = screen.getByTestId('waitlist-start-pro-checkout');
    expect(cta).toHaveTextContent(/^Start Pro$/);
    expect(screen.queryByTestId('price-lock-note')).toBeNull();
  });

  it('hides Start Pro without a configured price or on error receipts', () => {
    const { rerender } = render(<WaitlistOutcomeView outcome='pending' />);
    expect(screen.queryByTestId('waitlist-start-pro-checkout')).toBeNull();

    rerender(
      <WaitlistOutcomeView
        outcome='save_failed'
        proCheckoutPriceId='price_pro_monthly'
      />
    );
    expect(screen.queryByTestId('waitlist-start-pro-checkout')).toBeNull();
  });
});
