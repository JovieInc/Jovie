import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useJovieWorkFeedQueryMock, refetchMock } = vi.hoisted(() => ({
  useJovieWorkFeedQueryMock: vi.fn(),
  refetchMock: vi.fn(),
}));

vi.mock('@/lib/queries/useJovieWorkFeedQuery', () => ({
  useJovieWorkFeedQuery: useJovieWorkFeedQueryMock,
}));

import { JovieWorkFeed } from '@/components/features/dashboard/organisms/jovie-work-feed/JovieWorkFeed';

describe('JovieWorkFeed', () => {
  beforeEach(() => {
    useJovieWorkFeedQueryMock.mockReset();
    refetchMock.mockReset();
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
      refetch: refetchMock,
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

  it('uses the shared activity timeline row contract without shifting outcome slots', () => {
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
          outcomeSlot: 'release_outcome',
          outcome: {
            state: 'measuring',
            metrics: {
              gmvDeltaCents: 1800,
              clickDelta: 12,
              dspClickDelta: 7,
              newFansDelta: 3,
            },
          },
        },
      ],
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: refetchMock,
    });

    render(<JovieWorkFeed profileId='profile-123' />);

    const rowShell = screen.getByTestId('activity-timeline-row-shell');
    expect(rowShell).toHaveClass('gap-3', 'px-1.5', 'py-1');
    expect(rowShell).not.toHaveClass('gap-2.5', 'py-1.5');
    expect(screen.getByTestId('activity-timeline-leading')).toHaveClass(
      'h-6',
      'w-6',
      'rounded-full'
    );

    const timestamp = screen.getByTestId('activity-timeline-timestamp');
    expect(timestamp).toHaveAttribute(
      'dateTime',
      '2026-06-23T00:00:00.000Z'
    );
    expect(timestamp.parentElement).toHaveClass(
      'mt-0.5',
      'flex',
      'flex-wrap',
      'gap-x-1.5',
      'gap-y-0'
    );

    expect(screen.getByTestId('jovie-work-outcome-slot')).toHaveClass(
      'min-h-10'
    );
  });

  it('shows the empty state when no autonomous work exists', () => {
    useJovieWorkFeedQueryMock.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: refetchMock,
    });

    render(<JovieWorkFeed profileId='profile-123' />);

    expect(
      screen.getByText(/Jovie has not shipped autonomous work/i)
    ).toBeInTheDocument();
    expect(screen.getByTestId('jovie-work-empty-state').tagName).toBe(
      'OUTPUT'
    );
  });

  it('can hide the duplicate feed heading inside the full workspace', () => {
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
        },
      ],
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: refetchMock,
    });

    render(<JovieWorkFeed profileId='profile-123' showHeader={false} />);

    expect(screen.queryByText('Jovie Did This')).toBeNull();
    expect(screen.getByText('Release autopilot')).toBeVisible();
  });

  it('offers canonical retry behavior after a feed error', () => {
    useJovieWorkFeedQueryMock.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      error: new Error('Feed request failed'),
      refetch: refetchMock,
    });

    render(<JovieWorkFeed profileId='profile-123' />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Failed to load Jovie work feed'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry load' }));
    expect(refetchMock).toHaveBeenCalledOnce();
  });

  it('reserves one layout-stable result slot throughout a release run', () => {
    const fixtures = [
      {
        phase: 'pending',
        statusLabel: 'Needs approval',
        outcome: undefined,
        expected: null,
      },
      {
        phase: 'in_progress',
        statusLabel: 'In progress',
        outcome: undefined,
        expected: null,
      },
      {
        phase: 'completed',
        statusLabel: 'Done',
        outcome: {
          state: 'measuring',
          metrics: {
            gmvDeltaCents: 1800,
            clickDelta: 12,
            dspClickDelta: 7,
            newFansDelta: 3,
          },
        },
        expected: 'Measuring attributed results for 30 days.',
      },
      {
        phase: 'completed',
        statusLabel: 'Done',
        outcome: {
          state: 'measured_zero',
          metrics: {
            gmvDeltaCents: 0,
            clickDelta: 0,
            dspClickDelta: 0,
            newFansDelta: 0,
          },
        },
        expected: 'No attributed results in the 30-day window.',
      },
      {
        phase: 'completed',
        statusLabel: 'Done',
        outcome: {
          state: 'measured_positive',
          metrics: {
            gmvDeltaCents: 1800,
            clickDelta: 12,
            dspClickDelta: 0,
            newFansDelta: 3,
          },
        },
        expected: '$18.00',
      },
      {
        phase: 'completed',
        statusLabel: 'Done',
        outcome: { state: 'unavailable', metrics: null },
        expected: 'Attributed results are unavailable.',
      },
    ] as const;
    const slotClasses = new Set<string>();

    for (const fixture of fixtures) {
      useJovieWorkFeedQueryMock.mockReturnValue({
        data: [
          {
            id: `workflow:${fixture.outcome?.state ?? fixture.phase}`,
            source: 'workflow_run',
            phase: fixture.phase,
            title: 'Release autopilot',
            description: 'Jovie ran release-to-revenue for Midnight Drive.',
            icon: 'workflow',
            timestamp: '2026-06-23T00:00:00.000Z',
            statusLabel: fixture.statusLabel,
            outcomeSlot: 'release_outcome',
            outcome: fixture.outcome,
          },
        ],
        isLoading: false,
        isFetching: false,
        error: null,
        refetch: refetchMock,
      });

      const view = render(<JovieWorkFeed profileId='profile-123' />);
      const slot = screen.getByTestId('jovie-work-outcome-slot');
      slotClasses.add(slot.className);
      expect(slot).toHaveAttribute(
        'data-outcome-state',
        fixture.outcome?.state ?? 'reserved'
      );

      if (!fixture.outcome) {
        expect(slot).toHaveAttribute('aria-hidden', 'true');
        expect(slot).toBeEmptyDOMElement();
      } else {
        expect(screen.getByText(fixture.expected ?? '')).toBeVisible();
      }

      if (fixture.outcome?.state === 'measuring') {
        expect(screen.queryByText('$18.00')).toBeNull();
      }
      if (fixture.outcome?.state === 'measured_positive') {
        expect(screen.getByText('12')).toBeVisible();
        expect(screen.getByText('3')).toBeVisible();
        expect(screen.queryByText('DSP Clicks')).toBeNull();
      }

      view.unmount();
    }

    expect(slotClasses.size).toBe(1);
    expect([...slotClasses][0]).toContain('min-h-10');
  });

  it('does not reserve result geometry for unrelated work rows', () => {
    useJovieWorkFeedQueryMock.mockReturnValue({
      data: [
        {
          id: 'agent:1',
          source: 'agent_run',
          phase: 'in_progress',
          title: 'Metadata agent',
          description: 'Jovie agent Metadata Agent ran.',
          icon: 'agent',
          timestamp: '2026-06-23T00:00:00.000Z',
          statusLabel: 'In progress',
        },
      ],
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: refetchMock,
    });

    render(<JovieWorkFeed profileId='profile-123' />);

    expect(screen.queryByTestId('jovie-work-outcome-slot')).toBeNull();
  });
});
