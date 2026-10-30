import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomeAutoNotifySection } from './HomeAutoNotifySection';

vi.mock('./HomeNotificationCard', () => ({
  HomeNotificationCard: () => (
    <div data-testid='home-notification-card'>notification card</div>
  ),
}));

describe('HomeAutoNotifySection', () => {
  it('renders bounded auto-notify copy and notification receipt', () => {
    render(<HomeAutoNotifySection />);

    expect(screen.getByTestId('homepage-auto-notify')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Notify every fan. Automatically.',
      })
    ).toHaveClass('line-clamp-2');
    expect(
      screen.getByText(
        'Fans opt-in once. Every song hits their inbox automatically. No campaigns to setup. No copy to write. No emails to design. It just works.'
      )
    ).toBeInTheDocument();
    expect(screen.getByTestId('home-notification-card')).toBeInTheDocument();
  });
});
