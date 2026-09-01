'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CircleAlert,
  CircleCheck,
  Clock3,
  GitPullRequest,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { HudStatusPill } from '@/app/app/(shell)/admin/ops/HudStatusPill';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { TaskProjectionListRow } from '@/components/organisms/table';
import type { ShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';
import { parseShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';
import { cn } from '@/lib/utils';

const OPERATIONAL_TASK_POLL_MS = 6_000;

type OperationalTaskFeed = ShippingCockpitProjection['operationalTasks'];
type OperationalTask = OperationalTaskFeed['tasks'][number];
type WorkflowVisual = {
  readonly label: string;
  readonly className: string;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const EMPTY_FEED: OperationalTaskFeed = {
  canonicalSource: 'linear',
  cacheMode: 'local-reconciled',
  syncState: 'syncing',
  sourceId: 'symphony-runtime',
  observedAt: null,
  lastSyncedAt: null,
  freshnessDeadline: null,
  tasks: [],
  deltas: [],
};

function workflowVisual(
  state: OperationalTask['workflowState']
): WorkflowVisual {
  switch (state) {
    case 'running':
      return { label: 'Running', className: 'text-accent-blue', icon: Loader2 };
    case 'retrying':
      return {
        label: 'Retrying',
        className: 'text-accent-purple',
        icon: RotateCcw,
      };
    case 'blocked':
      return {
        label: 'Blocked',
        className: 'text-accent-red',
        icon: CircleAlert,
      };
    case 'merged':
    case 'production-verified':
      return {
        label: state === 'merged' ? 'Merged' : 'Production Verified',
        className: 'text-accent-green',
        icon: CircleCheck,
      };
    case 'queued':
    case 'merge-queued':
      return {
        label: state === 'queued' ? 'Queued' : 'Merge Queued',
        className: 'text-accent-purple',
        icon: Clock3,
      };
    case 'in-review':
      return {
        label: 'In Review',
        className: 'text-accent-orange',
        icon: GitPullRequest,
      };
  }
}

function syncVisual(state: OperationalTaskFeed['syncState']) {
  switch (state) {
    case 'fresh':
      return { label: 'Fresh', tone: 'good' as const };
    case 'stale':
      return { label: 'Stale Cache', tone: 'warning' as const };
    case 'syncing':
      return { label: 'Syncing', tone: 'neutral' as const };
    case 'failed':
      return { label: 'Sync Failed', tone: 'bad' as const };
  }
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'No successful sync yet';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Invalid sync timestamp';
  return `Synced ${new Date(timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

async function fetchOperationalTasks(
  kioskToken: string | null,
  signal: AbortSignal
): Promise<ShippingCockpitProjection> {
  const url = new URL('/api/hud/shipping-state', globalThis.location.origin);
  if (kioskToken) url.searchParams.set('kiosk', kioskToken);
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Operational task cache fetch failed (${response.status})`);
  }
  const parsed = parseShippingCockpitProjection(await response.json());
  if (!parsed) throw new Error('Operational task cache contract was invalid');
  return parsed;
}

export function OperationalTasksPanelView({
  feed,
  requestState = 'idle',
}: Readonly<{
  readonly feed: OperationalTaskFeed;
  readonly requestState?: 'idle' | 'fetching' | 'error';
}>) {
  const effectiveSyncState =
    requestState === 'error' && feed.tasks.length > 0
      ? 'stale'
      : requestState === 'error'
        ? 'failed'
        : requestState === 'fetching' && feed.lastSyncedAt == null
          ? 'syncing'
          : feed.syncState;
  const sync = syncVisual(effectiveSyncState);
  const deltas = new Map(feed.deltas.map(delta => [delta.taskId, delta]));

  return (
    <ContentSurfaceCard
      surface='details'
      className='overflow-hidden p-0'
      data-testid='ovie-operational-tasks'
    >
      <div className='flex min-h-16 items-center justify-between gap-3 border-b border-subtle px-3 py-2'>
        <div className='min-w-0'>
          <h2 className='text-app font-semibold text-primary-token'>
            Operational Tasks
          </h2>
          <p className='truncate text-2xs text-tertiary-token'>
            Linear canonical · local reconciled cache ·{' '}
            {formatTimestamp(feed.lastSyncedAt)}
          </p>
        </div>
        <HudStatusPill label={sync.label} tone={sync.tone} />
      </div>
      <div className='h-72 overflow-y-auto p-2' aria-live='polite'>
        {feed.tasks.length === 0 ? (
          <div className='grid h-full place-items-center text-center'>
            <p className='text-app text-secondary-token'>
              {effectiveSyncState === 'syncing'
                ? 'Loading the local task cache…'
                : effectiveSyncState === 'failed'
                  ? 'Task cache unavailable. Retrying automatically.'
                  : 'No active operational tasks.'}
            </p>
          </div>
        ) : (
          <div className='grid gap-1'>
            {feed.tasks.map(task => {
              const visual = workflowVisual(task.workflowState);
              const Icon = visual.icon;
              const delta = deltas.get(task.id);
              const transition = delta
                ? delta.fromState
                  ? `${delta.fromState} → ${delta.toState ?? 'removed'}`
                  : 'New'
                : null;
              return (
                <TaskProjectionListRow
                  key={task.id}
                  testId={`operational-task-${task.id}`}
                  leading={
                    <Icon
                      className={cn(
                        'h-4 w-4',
                        visual.className,
                        task.workflowState === 'running' && 'animate-spin'
                      )}
                      aria-hidden='true'
                    />
                  }
                  title={task.title}
                  metadata={
                    <div className='mt-px flex min-w-0 flex-wrap items-center gap-x-1.5 overflow-hidden text-3xs leading-4 text-tertiary-token'>
                      <span className={cn('font-medium', visual.className)}>
                        {visual.label}
                      </span>
                      <span className='font-semibold'>
                        {task.linearIdentifier}
                      </span>
                      {task.attempt == null ? null : (
                        <span>Attempt {task.attempt}</span>
                      )}
                      {task.retryAt == null ? null : (
                        <span>Retry scheduled</span>
                      )}
                    </div>
                  }
                  actionSlot={
                    <span className='inline-flex w-28 justify-end truncate text-3xs font-medium text-secondary-token'>
                      {transition ?? ' '}
                    </span>
                  }
                />
              );
            })}
          </div>
        )}
      </div>
    </ContentSurfaceCard>
  );
}

export function OperationalTasksPanel({
  kioskToken = null,
}: Readonly<{ readonly kioskToken?: string | null }>) {
  const query = useQuery({
    queryKey: ['hud', 'operational-tasks', kioskToken],
    queryFn: ({ signal }) => fetchOperationalTasks(kioskToken, signal),
    placeholderData: previous => previous,
    gcTime: OPERATIONAL_TASK_POLL_MS * 2,
    staleTime: OPERATIONAL_TASK_POLL_MS,
    refetchInterval: OPERATIONAL_TASK_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
  return (
    <OperationalTasksPanelView
      feed={query.data?.operationalTasks ?? EMPTY_FEED}
      requestState={
        query.isError ? 'error' : query.isFetching ? 'fetching' : 'idle'
      }
    />
  );
}
