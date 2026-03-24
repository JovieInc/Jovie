import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useActivityFeedQueryMock } = vi.hoisted(() => ({
  useActivityFeedQueryMock: vi.fn(),
}));

vi.mock('@/lib/queries', () => ({
  useActivityFeedQuery: useActivityFeedQueryMock,
}));

import { DashboardActivityFeed } from '@/features/dashboard/organisms/dashboard-activity-feed';

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
});
