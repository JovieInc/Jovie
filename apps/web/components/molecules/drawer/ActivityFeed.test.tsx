import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ActivityFeed, type EntityRailActivityItem } from './ActivityFeed';

const HOUR = 60 * 60 * 1000;

function iso(offsetMs: number): string {
  return new Date(Date.now() - offsetMs).toISOString();
}

const ITEMS: readonly EntityRailActivityItem[] = [
  {
    id: 'now',
    actor: 'Tim White',
    verb: 'edited',
    object: 'Midnight Drive',
    at: iso(5 * 60 * 1000),
  },
  {
    id: 'earlier-today',
    actor: 'Jovie',
    verb: 'linked',
    object: 'Spotify',
    at: iso(3 * HOUR),
  },
  {
    id: 'yesterday',
    actor: 'Maya Vale',
    verb: 'approved',
    object: 'Tour poster',
    at: iso(26 * HOUR),
  },
  {
    id: 'archive',
    actor: 'Jovie',
    verb: 'published',
    object: 'Lost in the Light',
    at: '2026-01-15T10:05:00Z',
  },
];

describe('ActivityFeed', () => {
  it('time-groups items into Today, Yesterday, and dated groups', async () => {
    const { container } = render(<ActivityFeed items={ITEMS} />);
    const today = screen
      .getByTestId('entity-rail-activity-feed')
      .querySelector('[data-activity-group="Today"]');
    expect(today).not.toBeNull();
    expect(
      today?.querySelectorAll('[data-testid="entity-rail-activity-item"]')
    ).toHaveLength(2);
    expect(
      screen
        .getByTestId('entity-rail-activity-feed')
        .querySelector('[data-activity-group="Yesterday"]')
    ).not.toBeNull();
    expect(
      screen
        .getByTestId('entity-rail-activity-feed')
        .querySelector('[data-activity-group="Jan 15"]')
    ).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders one quiet line per item: actor, verb, object', () => {
    render(<ActivityFeed items={[ITEMS[0]]} />);
    expect(screen.getByText('Tim White')).toBeInTheDocument();
    expect(screen.getByText('Midnight Drive')).toBeInTheDocument();
    expect(screen.getByTestId('entity-rail-activity-item')).toHaveTextContent(
      'edited'
    );
  });

  it('keeps tabular time labels on the quiet tertiary scale', () => {
    render(<ActivityFeed items={[ITEMS[0]]} />);
    const time = screen
      .getByTestId('entity-rail-activity-item')
      ?.querySelector('span');
    expect(time?.className).toContain('tabular-nums');
    expect(time?.className).toContain('text-tertiary-token');
  });

  it('shows the quiet empty state when there is no activity', async () => {
    const { container } = render(<ActivityFeed items={[]} />);
    expect(screen.getByTestId('entity-rail-activity-feed')).toHaveTextContent(
      'No activity yet.'
    );
    await expectNoA11yViolations(container);
  });
});
