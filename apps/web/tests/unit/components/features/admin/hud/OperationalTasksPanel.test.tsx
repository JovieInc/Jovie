import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OperationalTasksPanelView } from '@/components/features/admin/hud/OperationalTasksPanel';
import type { ShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';

type OperationalTaskFeed = ShippingCockpitProjection['operationalTasks'];

function feed(
  overrides: Partial<OperationalTaskFeed> = {}
): OperationalTaskFeed {
  return {
    canonicalSource: 'linear',
    cacheMode: 'local-reconciled',
    syncState: 'fresh',
    sourceId: 'symphony-runtime',
    observedAt: '2026-09-01T22:00:00.000Z',
    lastSyncedAt: '2026-09-01T22:00:00.000Z',
    freshnessDeadline: '2026-09-01T22:00:10.000Z',
    tasks: [
      {
        id: 'linear:JOV-5544',
        linearIdentifier: 'JOV-5544',
        linearUrl: 'https://linear.app/jovie/issue/JOV-5544/cache-symphony',
        title: 'Cache Symphony workspaces on NVMe',
        workflowState: 'running',
        priority: 'high',
        attempt: 2,
        retryAt: null,
        sourceRevision: 'rev-2',
        updatedAt: '2026-09-01T22:00:00.000Z',
      },
    ],
    deltas: [],
    ...overrides,
  };
}

describe('OperationalTasksPanelView', () => {
  it('renders the stable Linear identity from the local reconciled cache', () => {
    render(<OperationalTasksPanelView feed={feed()} />);

    expect(screen.getByText('Fresh')).toBeInTheDocument();
    expect(
      screen.getByText('Cache Symphony workspaces on NVMe')
    ).toBeInTheDocument();
    expect(screen.getByText('JOV-5544')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('Attempt 2')).toBeInTheDocument();
    expect(screen.getByTestId('ovie-operational-tasks')).toHaveTextContent(
      'Linear canonical · local reconciled cache'
    );
  });

  it('makes a running-to-retrying transition visually explicit', () => {
    render(
      <OperationalTasksPanelView
        feed={feed({
          tasks: [
            {
              ...feed().tasks[0],
              workflowState: 'retrying',
              attempt: 3,
              retryAt: '2026-09-01T22:05:00.000Z',
            },
          ],
          deltas: [
            {
              taskId: 'linear:JOV-5544',
              kind: 'updated',
              fromState: 'running',
              toState: 'retrying',
              sequence: 3,
            },
          ],
        })}
      />
    );

    expect(screen.getByText('Retrying')).toBeInTheDocument();
    expect(screen.getByText('Attempt 3')).toBeInTheDocument();
    expect(screen.getByText('Retry scheduled')).toBeInTheDocument();
    expect(screen.getByText('running → retrying')).toBeInTheDocument();
  });

  it('keeps last-known tasks visible and labels them stale after a request error', () => {
    render(<OperationalTasksPanelView feed={feed()} requestState='error' />);

    expect(screen.getByText('Stale Cache')).toBeInTheDocument();
    expect(
      screen.getByText('Cache Symphony workspaces on NVMe')
    ).toBeInTheDocument();
  });

  it('reports an unavailable cold cache without inventing tasks', () => {
    render(
      <OperationalTasksPanelView
        feed={feed({
          syncState: 'failed',
          lastSyncedAt: null,
          tasks: [],
          deltas: [],
        })}
        requestState='error'
      />
    );

    expect(screen.getByText('Sync Failed')).toBeInTheDocument();
    expect(
      screen.getByText('Task cache unavailable. Retrying automatically.')
    ).toBeInTheDocument();
    expect(screen.queryByText('JOV-5544')).not.toBeInTheDocument();
  });
});
