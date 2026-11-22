import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import type { ShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  emptyTaskMessage,
  OperationalTasksPanelView,
} from './OperationalTasksPanel';

type OperationalTaskFeed = ShippingCockpitProjection['operationalTasks'];
type ViewProps = ComponentProps<typeof OperationalTasksPanelView>;

const task: OperationalTaskFeed['tasks'][number] = {
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
};

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
    tasks: [task],
    deltas: [],
    ...overrides,
  };
}

const coldFeed = feed({
  syncState: 'syncing',
  lastSyncedAt: null,
  observedAt: null,
  freshnessDeadline: null,
  tasks: [],
});

function renderView(props: ViewProps) {
  return render(
    <RightPanelProvider>
      <OperationalTasksPanelView {...props} />
    </RightPanelProvider>
  );
}

function Controlled({
  onSelect,
}: {
  readonly onSelect: (id: string | null) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <RightPanelProvider>
      <OperationalTasksPanelView
        feed={feed({
          tasks: [
            task,
            {
              ...task,
              id: 'linear:JOV-5545',
              linearIdentifier: 'JOV-5545',
              title: 'Second task',
              linearUrl: null,
              attempt: null,
              workflowState: 'blocked',
            },
          ],
        })}
        selectedTaskId={selected}
        onSelectTask={id => {
          onSelect(id);
          setSelected(id);
        }}
      />
    </RightPanelProvider>
  );
}

describe('OperationalTasksPanelView (colocated)', () => {
  it('renders fresh tasks with workflow metadata, axe-clean', async () => {
    const { container } = renderView({ feed: feed() });

    const row = screen.getByTestId('operational-task-linear:JOV-5544');
    expect(screen.getByText('Fresh')).toBeInTheDocument();
    expect(within(row).getByText('Running')).toBeInTheDocument();
    expect(within(row).getByText('Attempt 2')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: task.title })).toHaveAttribute(
      'href',
      task.linearUrl
    );
    expect(
      screen.getByRole('heading', { name: 'Operational Tasks' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows the loading message on a first fetch, axe-clean', async () => {
    const { container } = renderView({
      feed: coldFeed,
      requestState: 'fetching',
    });

    expect(screen.getByText('Syncing')).toBeInTheDocument();
    expect(
      screen.getByText('Loading the local task cache…')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('reports unknown tasks when a cold cache request fails, axe-clean', async () => {
    const { container } = renderView({ feed: coldFeed, requestState: 'error' });

    expect(screen.getByText('Sync Failed')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Task cache unavailable. Active tasks are unknown. Retrying automatically.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('labels last-known tasks stale after a request error, axe-clean', async () => {
    const { container } = renderView({ feed: feed(), requestState: 'error' });

    expect(screen.getByText('Stale Cache')).toBeInTheDocument();
    expect(screen.getByText(task.title)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows the empty line only for a fresh, empty cache', async () => {
    const { container } = renderView({ feed: feed({ tasks: [] }) });

    expect(
      screen.getByText('No active operational tasks.')
    ).toBeInTheDocument();
    expect(emptyTaskMessage('stale', null)).toBe(
      'Task cache is stale (No successful sync yet). Active tasks are unknown until the next sync.'
    );
    expect(emptyTaskMessage('stale', 'not-a-date')).toContain(
      'Invalid sync timestamp'
    );
    await expectNoA11yViolations(container);
  });

  it('selects and deselects a task through Inspect', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { container } = render(<Controlled onSelect={onSelect} />);
    const first = screen.getByRole('button', {
      name: `Inspect JOV-5544: ${task.title}`,
    });
    const second = screen.getByRole('button', {
      name: 'Inspect JOV-5545: Second task',
    });
    expect(first).toHaveAttribute('aria-expanded', 'false');

    await user.click(first);
    expect(onSelect).toHaveBeenLastCalledWith('linear:JOV-5544');
    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(second).toHaveAttribute('aria-expanded', 'false');
    await expectNoA11yViolations(container);

    await user.click(second);
    expect(onSelect).toHaveBeenLastCalledWith('linear:JOV-5545');
    expect(first).toHaveAttribute('aria-expanded', 'false');

    await user.click(second);
    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(onSelect).toHaveBeenCalledTimes(3);
  });

  it('does not throw when Inspect is clicked without a handler', async () => {
    const user = userEvent.setup();
    renderView({ feed: feed() });

    await user.click(screen.getByRole('button', { name: /Inspect JOV-5544/ }));

    expect(
      screen.getByRole('button', { name: /Inspect JOV-5544/ })
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('gives Fleet rows real hover and a selected fill distinct from hover', () => {
    const { unmount } = renderView({ feed: feed() });
    const idle = screen.getByTestId('operational-task-linear:JOV-5544');
    expect(idle).toHaveClass('min-h-11', 'system-b-table-row-hover');
    unmount();

    renderView({ feed: feed(), selectedTaskId: 'linear:JOV-5544' });
    const selected = screen.getByTestId('operational-task-linear:JOV-5544');
    expect(selected).toHaveClass('system-b-table-row-selected');
    expect(selected).not.toHaveClass('system-b-table-row-hover');
  });
});
