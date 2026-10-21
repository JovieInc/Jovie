import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ signOut: vi.fn() }),
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

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

describe('interview waitlist receipt', () => {
  it.each(['pending', 'waitlisted_gate_on', 'already_waitlisted'] as const)(
    'offers resume without a purchase shortcut for %s',
    outcome => {
      render(
        <WaitlistOutcomeView outcome={outcome} email='artist@example.com' />
      );
      expect(screen.queryByTestId('waitlist-start-pro-checkout')).toBeNull();
      expect(screen.getByTestId('waitlist-resume-start')).toHaveAttribute(
        'href',
        '/start'
      );
      expect(
        screen.getByText(/music artists who upload regularly to YouTube/)
      ).toBeVisible();
      expect(screen.queryByText(/few days/)).toBeNull();
    }
  );

  it.each(['coolartist', null])(
    'keeps purchase unavailable with reserved handle %s',
    reservedHandle => {
      render(
        <WaitlistOutcomeView
          outcome='pending'
          reservedHandle={reservedHandle}
        />
      );
      expect(screen.queryByTestId('waitlist-start-pro-checkout')).toBeNull();
      expect(screen.getByTestId('waitlist-resume-start')).toHaveAttribute(
        'href',
        '/start'
      );
    }
  );

  it('keeps purchase unavailable on error receipts', () => {
    render(<WaitlistOutcomeView outcome='save_failed' />);
    expect(screen.queryByTestId('waitlist-start-pro-checkout')).toBeNull();
  });
});
