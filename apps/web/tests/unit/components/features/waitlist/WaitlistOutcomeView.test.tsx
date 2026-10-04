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
    expect(cta).toHaveTextContent('Start Pro ($199)');
    fireEvent.click(cta);
    // Default checkout: no onboarding source, so success lands on
    // /billing/success and routes a link-less buyer to /start.
    expect(checkout.mutate).toHaveBeenCalledWith(
      { priceId: 'price_pro_monthly' },
      expect.any(Object)
    );
    expect(screen.getByTestId('waitlist-resume-start')).toBeInTheDocument();
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
