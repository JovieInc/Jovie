import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityEvent } from '@/lib/activity/types';
import { ActivityFeed } from './ActivityFeed';

const events = [
  {
    id: 'event-older',
    entityType: 'profile',
    entityId: 'profile-1',
    action: 'updated',
    description: 'Updated artist profile metadata.',
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    actor: { type: 'user', name: 'Avery' },
  },
  {
    id: 'event-newer',
    entityType: 'release',
    entityId: 'release-1',
    action: 'published',
    description: 'Published Listen Now links.',
    createdAt: new Date('2026-09-01T11:00:00.000Z'),
    actor: { type: 'system', name: 'Jovie' },
  },
] satisfies ActivityEvent[];

describe('ActivityFeed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sorts events into the shared timeline row contract', () => {
    render(<ActivityFeed events={events} />);

    expect(screen.getByRole('feed', { name: 'Activity Feed' })).toBeVisible();
    expect(screen.getAllByTestId('activity-timeline-row')).toHaveLength(2);

    const rowShells = screen.getAllByTestId('activity-timeline-row-shell');
    expect(rowShells[0]).toHaveTextContent('Published Listen Now links.');
    for (const rowShell of rowShells) {
      expect(rowShell).toHaveClass('gap-3', 'px-1.5', 'py-1');
      expect(rowShell).not.toHaveClass('gap-2.5', 'py-1.5');
    }

    const timestamps = screen.getAllByTestId('activity-timeline-timestamp');
    expect(timestamps[0]).toHaveAttribute(
      'dateTime',
      '2026-09-01T11:00:00.000Z'
    );
    expect(timestamps[0]).toHaveTextContent('1h ago');
    expect(screen.getAllByTestId('activity-timeline-line')[1]).toHaveClass(
      'group-last:hidden'
    );
  });

  it('keeps the loading skeleton on the same row shell geometry', () => {
    render(<ActivityFeed events={[]} isLoading />);

    expect(screen.getByRole('feed', { name: 'Activity Feed' })).toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(
      screen.getAllByTestId('activity-timeline-skeleton-line')
    ).toHaveLength(4);
  });
});
