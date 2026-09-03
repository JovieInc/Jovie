import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useActivityFeedQueryMock } = vi.hoisted(() => ({
  useActivityFeedQueryMock: vi.fn(),
}));

vi.mock('@/lib/queries', () => ({
  useActivityFeedQuery: useActivityFeedQueryMock,
}));

import { DashboardActivityFeed } from '@/components/features/dashboard/organisms/dashboard-activity-feed/DashboardActivityFeed';

describe('DashboardActivityFeed', () => {
  beforeEach(() => {
    useActivityFeedQueryMock.mockReset();
  });

  it('renders stale and unknown icon payloads without crashing', () => {
    useActivityFeedQueryMock.mockReturnValue({
      data: [
        {
          id: 'activity-1',
          type: 'click',
          description: 'Legacy emoji payload',
          icon: '🎧',
          timestamp: '2026-03-23T00:00:00.000Z',
          href: '/app/dashboard/audience',
        },
        {
          id: 'activity-2',
          type: 'click',
          description: 'Unknown icon payload',
          icon: 'totally-unknown',
          timestamp: '2026-03-23T01:00:00.000Z',
        },
      ],
      isLoading: false,
      isFetching: false,
      error: null,
    });

    const { container } = render(
      <DashboardActivityFeed profileId='profile-123' />
    );

    expect(screen.getByText('Legacy emoji payload')).toBeInTheDocument();
    expect(screen.getByText('Unknown icon payload')).toBeInTheDocument();
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(0);
  });

  it('uses the shared activity timeline row contract for geometry and timestamps', () => {
    useActivityFeedQueryMock.mockReturnValue({
      data: [
        {
          id: 'activity-1',
          type: 'visit',
          description: 'Viewed profile',
          icon: 'visit',
          timestamp: '2026-03-23T01:00:00.000Z',
          href: '/app/dashboard/audience',
        },
        {
          id: 'activity-2',
          type: 'click',
          description: 'Clicked merch link',
          icon: 'link',
          timestamp: '2026-03-23T00:00:00.000Z',
        },
      ],
      isLoading: false,
      isFetching: false,
      error: null,
    });

    render(<DashboardActivityFeed profileId='profile-123' />);

    const rows = screen.getAllByTestId('activity-timeline-row');
    expect(rows).toHaveLength(2);

    const rowShells = screen.getAllByTestId('activity-timeline-row-shell');
    expect(rowShells).toHaveLength(2);
    for (const rowShell of rowShells) {
      expect(rowShell).toHaveClass('gap-3', 'px-1.5', 'py-1');
      expect(rowShell).not.toHaveClass('gap-2.5', 'py-1.5');
    }

    for (const leading of screen.getAllByTestId('activity-timeline-leading')) {
      expect(leading).toHaveClass('h-6', 'w-6', 'rounded-full');
    }

    const timestamps = screen.getAllByTestId('activity-timeline-timestamp');
    expect(timestamps).toHaveLength(2);
    expect(timestamps[0]).toHaveAttribute(
      'dateTime',
      '2026-03-23T01:00:00.000Z'
    );
    expect(timestamps[0].parentElement).toHaveClass(
      'mt-0.5',
      'flex',
      'flex-wrap',
      'gap-x-1.5',
      'gap-y-0'
    );

    const timelineLines = screen.getAllByTestId('activity-timeline-line');
    expect(timelineLines).toHaveLength(2);
    expect(timelineLines[1]).toHaveClass('group-last:hidden');
  });
});
