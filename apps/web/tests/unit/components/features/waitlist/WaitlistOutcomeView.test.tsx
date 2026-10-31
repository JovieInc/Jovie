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
vi.mock('@/lib/queries', () => ({ useCheckoutMutation: () => checkout }));

import { WaitlistOutcomeView } from '@/components/features/waitlist/WaitlistOutcomeView';
import { getPublicPriceClaim } from '@/lib/billing/offer-truth';

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
    render(
      <WaitlistOutcomeView
        outcome='pending'
        reservedHandle={handle}
        proCheckoutPriceId='price_pro_monthly'
      />
    );

    const cta = screen.getByTestId('waitlist-start-pro-checkout');
    expect(cta).toHaveTextContent(getPublicPriceClaim('pro').ctaLabel);
    expect(cta).toHaveTextContent('Start Artist Presence');
    expect(cta).not.toHaveTextContent('Start Pro');
    fireEvent.click(cta);
    // Default checkout: no onboarding source, so success lands on
    // /billing/success and routes a link-less buyer to /start.
    expect(checkout.mutate).toHaveBeenCalledWith(
      { priceId: 'price_pro_monthly' },
      expect.any(Object)
    );
    expect(screen.getByTestId('waitlist-resume-start')).toBeInTheDocument();
  });

  it('says what paying buys: it skips the waitlist (paid admission)', () => {
    render(
      <WaitlistOutcomeView
        outcome='pending'
        reservedHandle='coolartist'
        proCheckoutPriceId='price_pro_monthly'
      />
    );

    // A verified payment admits the buyer (admitPaidUser), so the paid ask
    // must read as skip-the-line, never as paying to stay on the list.
    const note = screen.getByTestId('waitlist-start-pro-note');
    expect(note).toHaveTextContent(/skip the waitlist/i);
    expect(note).toHaveTextContent(/setup opens as soon as payment clears/i);
    const { priceLabel, cadence } = getPublicPriceClaim('pro');
    expect(note).toHaveTextContent(`${priceLabel}${cadence}`);
  });

  it('shows no skip-the-waitlist note without the paid CTA', () => {
    render(<WaitlistOutcomeView outcome='pending' />);
    expect(screen.queryByTestId('waitlist-start-pro-note')).toBeNull();
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
