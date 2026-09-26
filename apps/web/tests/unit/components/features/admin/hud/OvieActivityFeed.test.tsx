import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OvieActivityFeed } from '@/components/features/admin/hud/OvieActivityFeed';
import { useHudShippingStateQuery } from '@/components/features/admin/hud/useHudShippingStateQuery';
import type { OvieActivityFeed as Feed } from '@/lib/hud/ovie-activity-feed';
import type { OperationalTaskFeed } from '@/lib/ovie/shipping-state';

vi.mock('@/components/features/admin/hud/useHudShippingStateQuery', () => ({
  useHudShippingStateQuery: vi.fn(),
}));

const mockedQuery = vi.mocked(useHudShippingStateQuery);

function taskFeed(
  tasks: OperationalTaskFeed['tasks'],
  syncState: OperationalTaskFeed['syncState'] = 'fresh'
): OperationalTaskFeed {
  return {
    canonicalSource: 'linear',
    cacheMode: 'local-reconciled',
    syncState,
    sourceId: 'symphony-task',
    observedAt: '2026-09-26T09:00:00.000Z',
    lastSyncedAt: '2026-09-26T09:00:00.000Z',
    freshnessDeadline: '2026-09-26T09:01:00.000Z',
    tasks,
    deltas: [],
  };
}

function mockQuery(tasks: OperationalTaskFeed) {
  mockedQuery.mockReturnValue({
    view: {},
    operationalTasks: tasks,
    operationalRequestState: 'idle',
  } as unknown as ReturnType<typeof useHudShippingStateQuery>);
}

const BASE_FEED: Feed = {
  availability: 'available',
  truncated: false,
  rows: [
    {
      id: 'receipt:JOV-1:abc1234567890abcdef',
      source: 'deploy-receipt',
      state: 'deployed',
      stateLabel: 'Deployed',
      title: 'JOV-1 deployed',
      actor: 'dogfood receipt',
      linearIdentifier: 'JOV-1',
      linearUrl: null,
      prUrl: null,
      digestUrl: null,
      detail: 'prod abc1234 · receipted 2026-09-26T00:00:00.000Z',
      updatedAtIso: '2026-09-26T00:00:00.000Z',
      freshness: 'fresh',
    },
    {
      id: 'digest:ship-1-0-0-0',
      source: 'public-digest',
      state: 'publicly-available',
      stateLabel: "What's New",
      title: 'Ship things',
      actor: 'public digest',
      linearIdentifier: null,
      linearUrl: null,
      prUrl: null,
      digestUrl: '/changelog#ship-1-0-0-0',
      detail: '2026-09-25 · v1.0.0',
      updatedAtIso: null,
      freshness: 'fresh',
    },
  ],
};

describe('OvieActivityFeed', () => {
  it('renders server rows with exact state labels and provenance links', () => {
    mockQuery(taskFeed([]));
    render(<OvieActivityFeed feed={BASE_FEED} />);
    const feed = screen.getByTestId('ovie-activity-feed');
    expect(feed).toHaveTextContent('Deployed');
    expect(feed).toHaveTextContent("What's New");
    expect(feed).toHaveTextContent('2 Events');
    expect(screen.getByRole('link', { name: /ship things/i })).toHaveAttribute(
      'href',
      '/changelog#ship-1-0-0-0'
    );
  });

  it('prepends live Linear-ledger task rows from the runtime feed', () => {
    mockQuery(
      taskFeed([
        {
          id: 'linear:JOV-5322',
          linearIdentifier: 'JOV-5322',
          linearUrl: 'https://linear.app/jovie/issue/JOV-5322',
          title: 'Company activity feed',
          workflowState: 'running',
          priority: 'high',
          attempt: null,
          retryAt: null,
          sourceRevision: null,
          updatedAt: '2026-09-26T09:00:00.000Z',
        },
      ])
    );
    render(<OvieActivityFeed feed={BASE_FEED} />);
    const feed = screen.getByTestId('ovie-activity-feed');
    expect(feed).toHaveTextContent('JOV-5322');
    expect(feed).toHaveTextContent('In Progress');
    expect(feed).toHaveTextContent('Symphony runtime active');
    expect(feed).toHaveTextContent('3 Events');
    expect(
      screen.getByRole('link', { name: /open jov-5322 in linear/i })
    ).toHaveAttribute('href', 'https://linear.app/jovie/issue/JOV-5322');
  });

  it('shows an explicit empty state instead of fake numbers', () => {
    mockQuery(taskFeed([], 'syncing'));
    render(
      <OvieActivityFeed
        feed={{ availability: 'not_configured', rows: [], truncated: false }}
      />
    );
    expect(screen.getByTestId('ovie-activity-feed')).toHaveTextContent(
      'Activity sources unavailable.'
    );
    expect(screen.getByTestId('ovie-activity-feed')).toHaveTextContent(
      'No Signal'
    );
  });
});
