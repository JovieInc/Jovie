import { render, screen } from '@testing-library/react';
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

describe('WaitlistOutcomeView has no payment ask (invite-only GTM)', () => {
  it.each([
    ['pending with a reserved handle', 'pending', 'coolartist'],
    ['pending with no link', 'pending', null],
    ['save_failed', 'save_failed', null],
    ['rate_limited', 'rate_limited', null],
    ['receipt_unavailable', 'receipt_unavailable', null],
  ] as const)(
    '%s shows no payment CTA or skip-the-line copy',
    (_l, outcome, handle) => {
      const { container } = render(
        <WaitlistOutcomeView outcome={outcome} reservedHandle={handle} />
      );

      expect(screen.queryByTestId('waitlist-start-pro-checkout')).toBeNull();
      expect(screen.queryByTestId('waitlist-start-pro-note')).toBeNull();
      expect(container.textContent).not.toMatch(
        /skip the waitlist|payment|checkout|\$\d|\/month|Artist Presence|Start Pro|credit card|\bcard\b/i
      );
      expect(checkout.mutate).not.toHaveBeenCalled();
    }
  );

  it('keeps the pending confirmation actionable: resume at /start, no dead end', () => {
    render(<WaitlistOutcomeView outcome='pending' />);
    expect(screen.getByTestId('waitlist-resume-start')).toHaveAttribute(
      'href',
      '/start'
    );
  });
});
