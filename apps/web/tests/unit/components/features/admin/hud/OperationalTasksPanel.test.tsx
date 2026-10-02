import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperationalTasksPanelView } from '@/components/features/admin/hud/OperationalTasksPanel';
import type { ShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';

type OperationalTaskFeed = ShippingCockpitProjection['operationalTasks'];
type OperationalTask = OperationalTaskFeed['tasks'][number];

function Harness({ feed }: Readonly<{ feed: OperationalTaskFeed }>) {
  const [selected, setSelected] = useState<OperationalTask['id'] | null>(null);
  return (
    <OperationalTasksPanelView
      feed={feed}
      selectedTaskId={selected}
      onSelectTask={setSelected}
    />
  );
}

function feed(
  overrides: Partial<OperationalTaskFeed> = {}
): OperationalTaskFeed {
  return {
    canonicalSource: 'linear',
    cacheMode: 'local-reconciled',
    syncState: 'fresh',
    sourceId: 'lane-pull-requests',
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
    const panel = screen.getByTestId('ovie-operational-tasks');
    expect(panel).toHaveTextContent(
      'Linear canonical · local reconciled cache'
    );
    expect(panel.className).toContain('overflow-hidden');
    expect(panel.className.split(/\s+/)).not.toContain('p-0');
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

  describe('inspect and canonical recovery', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const blockedFeed = () =>
      feed({
        tasks: [
          {
            ...feed().tasks[0],
            workflowState: 'blocked',
            pullRequest: {
              number: 42,
              url: 'https://github.com/JovieInc/Jovie/pull/42',
              branch: 'devin/jov-5544',
              agent: 'devin',
              isDraft: false,
              checks: { rollup: 'failure', failing: ['PR Ready'] },
              queuePosition: null,
              queueState: null,
              createdAt: '2026-09-01T20:00:00.000Z',
            },
          },
        ],
      });

    it('opens the inspector with owner, failing dependency, and next action', () => {
      render(<Harness feed={blockedFeed()} />);

      fireEvent.click(
        screen.getByRole('button', {
          name: 'Inspect JOV-5544: Cache Symphony workspaces on NVMe',
        })
      );

      const rail = screen.getByTestId('shipping-row-rail');
      expect(rail).toHaveTextContent('Owner');
      expect(rail).toHaveTextContent('devin');
      expect(rail).toHaveTextContent('Failing checks');
      expect(rail).toHaveTextContent('PR Ready');
      expect(rail).toHaveTextContent('Next Expected Action');
      expect(rail).toHaveTextContent('#42 on GitHub');
      expect(rail).toHaveTextContent('JOV-5544');
    });

    it('requests the canonical reconcile and shows the durable receipt', async () => {
      const fetcher = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            persisted: 'created',
            result: { eventId: 'sum_QYMFgF57GrOps8oualjPI5dD' },
          }),
          { status: 200 }
        )
      );
      vi.stubGlobal('fetch', fetcher);
      render(<Harness feed={blockedFeed()} />);

      fireEvent.click(screen.getByRole('button', { name: /Inspect JOV-5544/ }));
      fireEvent.click(screen.getByTestId('summer-reconcile-request'));

      const receipt = await screen.findByTestId('summer-reconcile-receipt');
      expect(receipt).toHaveTextContent('Recorded');
      expect(receipt).toHaveTextContent('sum_QYMFgF57GrOps8oualjPI5dD');
      expect(fetcher).toHaveBeenCalledWith('/api/ovie/summer/reconcile', {
        method: 'GET',
        cache: 'no-store',
      });
    });

    it('reports an existing receipt on a repeated request instead of duplicating', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              ok: true,
              persisted: 'existing',
              result: { eventId: 'sum_QYMFgF57GrOps8oualjPI5dD' },
            }),
            { status: 200 }
          )
        )
      );
      render(<Harness feed={blockedFeed()} />);

      fireEvent.click(screen.getByRole('button', { name: /Inspect JOV-5544/ }));
      fireEvent.click(screen.getByTestId('summer-reconcile-request'));

      expect(
        await screen.findByTestId('summer-reconcile-receipt')
      ).toHaveTextContent('Already recorded');
    });

    it('surfaces an explicit denial instead of a false green', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            new Response(
              JSON.stringify({ ok: false, code: 'founder_access_required' }),
              { status: 403 }
            )
          )
      );
      render(<Harness feed={blockedFeed()} />);

      fireEvent.click(screen.getByRole('button', { name: /Inspect JOV-5544/ }));
      fireEvent.click(screen.getByTestId('summer-reconcile-request'));

      const denial = await screen.findByTestId('summer-reconcile-denial');
      expect(denial).toHaveTextContent('founder access is required');
      expect(
        screen.queryByTestId('summer-reconcile-receipt')
      ).not.toBeInTheDocument();
    });

    it('stays read-only with an explanation when no recovery is indicated', () => {
      render(
        <Harness
          feed={feed({
            tasks: [
              { ...feed().tasks[0], updatedAt: new Date().toISOString() },
            ],
          })}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /Inspect JOV-5544/ }));

      expect(
        screen.getByText(/no authorized operation applies/i)
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId('summer-reconcile-request')
      ).not.toBeInTheDocument();
    });
  });
});
