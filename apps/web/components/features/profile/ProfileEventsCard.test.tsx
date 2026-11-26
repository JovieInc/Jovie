import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProfileEventsCard } from './ProfileEventsCard';

const ACCENT = { accent: 'pulse', strength: 'text' } as const;

describe('ProfileEventsCard', () => {
  it('hides the Events section when there are no dates (JOV-14241)', () => {
    const { container } = render(
      <ProfileEventsCard accent={ACCENT} hasEvents={false} />
    );

    expect(screen.queryByTestId('profile-primary-tab-events-empty')).toBeNull();
    expect(screen.queryByTestId('profile-events-card')).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('hosts the event list when dates exist', async () => {
    const { container } = render(
      <ProfileEventsCard accent={ACCENT} hasEvents>
        <ul>
          <li>The Echo</li>
        </ul>
      </ProfileEventsCard>
    );

    const card = screen.getByTestId('profile-events-card');
    expect(within(card).getByText('The Echo')).toBeInTheDocument();
    expect(within(card).queryByRole('heading')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps the reserved height on the card that lists dates', () => {
    render(
      <ProfileEventsCard accent={ACCENT} hasEvents>
        <p>The Echo</p>
      </ProfileEventsCard>
    );
    expect(screen.getByTestId('profile-events-card')).not.toHaveClass(
      'profile-mode-card--compact'
    );
  });
});
