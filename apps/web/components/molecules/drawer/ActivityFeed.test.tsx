import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ActivityFeed } from './ActivityFeed';
import { ACTIVITY_ITEMS as ITEMS } from './drawer.fixtures';

describe('ActivityFeed', () => {
  beforeEach(() => {
    vi.stubEnv('TZ', 'America/Los_Angeles');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });
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
        .querySelector('[data-activity-group="Jan 13"]')
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
