import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useJovieWorkFeedQueryMock } = vi.hoisted(() => ({
  useJovieWorkFeedQueryMock: vi.fn(),
}));

vi.mock('@/lib/queries/useJovieWorkFeedQuery', () => ({
  useJovieWorkFeedQuery: useJovieWorkFeedQueryMock,
}));

import { JovieWorkFeed } from '@/components/features/dashboard/organisms/jovie-work-feed';

describe('JovieWorkFeed', () => {
  beforeEach(() => {
    useJovieWorkFeedQueryMock.mockReset();
  });

  it('renders autonomous work items with phase badges', () => {
    useJovieWorkFeedQueryMock.mockReturnValue({
      data: [
        {
          id: 'workflow:1',
          source: 'workflow_run',
          phase: 'completed',
          title: 'Release autopilot',
          description: 'Jovie ran release-to-revenue for Midnight Drive.',
          icon: 'workflow',
          timestamp: '2026-06-23T00:00:00.000Z',
          statusLabel: 'Done',
          href: '/app/releases',
        },
      ],
      isLoading: false,
      isFetching: false,
      error: null,
    });

    render(<JovieWorkFeed profileId='profile-123' />);

    expect(screen.getByTestId('jovie-work-feed')).toBeInTheDocument();
    expect(screen.getByText('Jovie Did This')).toBeInTheDocument();
    expect(screen.getByText('Release autopilot')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(
      screen.getByText('Jovie ran release-to-revenue for Midnight Drive.')
    ).toBeInTheDocument();
  });

  it('shows the empty state when no autonomous work exists', () => {
    useJovieWorkFeedQueryMock.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      error: null,
    });

    render(<JovieWorkFeed profileId='profile-123' />);

    expect(
      screen.getByText(/Jovie has not shipped autonomous work/i)
    ).toBeInTheDocument();
  });
});
