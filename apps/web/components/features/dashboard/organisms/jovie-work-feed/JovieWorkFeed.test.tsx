import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JovieWorkItem } from '@/lib/activity/jovie-work-feed';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { JovieWorkFeed } from './JovieWorkFeed';

const { query, refetch, queryArgs } = vi.hoisted(() => ({
  query: {
    data: undefined as JovieWorkItem[] | undefined,
    isLoading: false,
    isFetching: false,
    error: null as Error | null,
  },
  refetch: vi.fn(),
  queryArgs: vi.fn(),
}));

vi.mock('@/lib/queries/useJovieWorkFeedQuery', () => ({
  useJovieWorkFeedQuery: (args: unknown) => {
    queryArgs(args);
    return { ...query, refetch };
  },
}));

const items: JovieWorkItem[] = [
  {
    id: 'workflow-1',
    source: 'workflow_run',
    phase: 'completed',
    title: 'Release autopilot',
    description: 'Jovie ran release-to-revenue for Midnight Drive.',
    icon: 'workflow',
    timestamp: '2026-11-14T10:00:00.000Z',
    statusLabel: 'Done',
    href: '/app/releases',
    outcomeSlot: 'release_outcome',
    outcome: {
      state: 'measured_positive',
      metrics: {
        gmvDeltaCents: 1800,
        clickDelta: 12,
        dspClickDelta: 7,
        newFansDelta: 3,
      },
    },
  },
  {
    id: 'agent-1',
    source: 'agent_run',
    phase: 'failed',
    title: 'Metadata agent',
    description: 'Metadata Agent could not reach the distributor.',
    icon: 'agent',
    timestamp: '2026-11-14T09:00:00.000Z',
    statusLabel: 'Failed',
    outcomeSlot: 'release_outcome',
    outcome: { state: 'measuring', metrics: null },
  },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-14T12:00:00.000Z'));
  query.data = undefined;
  query.isLoading = false;
  query.isFetching = false;
  query.error = null;
  refetch.mockReset();
  queryArgs.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('JovieWorkFeed', () => {
  it('lists finished work with outcomes and links to the source', async () => {
    query.data = items;
    const { container } = render(
      <JovieWorkFeed profileId='profile-1' range='30d' completedOnly />
    );

    expect(queryArgs).toHaveBeenCalledWith({
      profileId: 'profile-1',
      range: '30d',
      completedOnly: true,
    });
    expect(
      screen.getByRole('heading', { name: 'Jovie Did This' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(
      screen.getByRole('link', { name: /Release autopilot/ })
    ).toHaveAttribute('href', '/app/releases');
    expect(
      screen.getByTestId('jovie-work-outcome-verified-money')
    ).toBeInTheDocument();
    expect(screen.getByText(/Measuring verified money/)).toBeInTheDocument();
    expect(screen.getByText('2 items loaded')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('retries a failed load', async () => {
    const user = userEvent.setup();
    query.error = new Error('Network request failed');
    const { container } = render(<JovieWorkFeed profileId='profile-1' />);

    expect(
      screen.getByText('Failed to load Jovie work feed')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Retry load' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the loading skeleton and the empty window', async () => {
    query.isLoading = true;
    query.isFetching = true;
    const loading = render(<JovieWorkFeed profileId='profile-1' />);
    expect(screen.queryByTestId('jovie-work-empty-state')).toBeNull();
    expect(screen.queryByRole('listitem')).toBeNull();
    await expectNoA11yViolations(loading.container);
    loading.unmount();

    query.isLoading = false;
    query.isFetching = true;
    query.data = [];
    const { container } = render(
      <JovieWorkFeed profileId='profile-1' showHeader={false} />
    );
    expect(screen.getByTestId('jovie-work-empty-state')).toHaveTextContent(
      'Nothing Shipped In This Window'
    );
    expect(screen.getByText('Refreshing Jovie work feed')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Jovie Did This' })
    ).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL copy accessible', async () => {
    const longTitle =
      'إطلاق تلقائي للإصدار الجديد مع إشعارات المعجبين وتحديث البيانات الوصفية';
    query.data = [{ ...items[0], title: longTitle, outcome: undefined }];
    const { container } = render(
      <div dir='rtl'>
        <JovieWorkFeed profileId='profile-1' />
      </div>
    );
    expect(screen.getByText(longTitle)).toBeInTheDocument();
    expect(screen.getByTestId('jovie-work-outcome-slot')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    await expectNoA11yViolations(container);
  });
});
