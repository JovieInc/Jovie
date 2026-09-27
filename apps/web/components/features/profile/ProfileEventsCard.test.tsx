import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProfileEventsCard } from './ProfileEventsCard';

const ACCENT = { accent: 'pulse', strength: 'text' } as const;

describe('ProfileEventsCard', () => {
  it('states plainly that there are no events, with no invented CTA', () => {
    render(<ProfileEventsCard accent={ACCENT} hasEvents={false} />);

    const card = screen.getByTestId('profile-primary-tab-events-empty');
    expect(card).toHaveAccessibleName('Events');
    expect(card).toHaveAttribute('data-accent', 'pulse');
    expect(
      within(card).getByRole('heading', { name: 'No upcoming events' })
    ).toBeInTheDocument();
    expect(within(card).getByText('New dates will appear here.')).toBeVisible();
    expect(within(card).queryByRole('link')).toBeNull();
    expect(within(card).queryByRole('button')).toBeNull();
  });

  it('hosts the event list when dates exist', () => {
    render(
      <ProfileEventsCard accent={ACCENT} hasEvents>
        <ul>
          <li>The Echo</li>
        </ul>
      </ProfileEventsCard>
    );

    const card = screen.getByTestId('profile-events-card');
    expect(within(card).getByText('The Echo')).toBeInTheDocument();
    expect(within(card).queryByRole('heading')).toBeNull();
    expect(screen.queryByTestId('profile-primary-tab-events-empty')).toBeNull();
  });
});
