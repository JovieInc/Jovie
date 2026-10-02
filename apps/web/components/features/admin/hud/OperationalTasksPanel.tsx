'use client';

// @coverage-via apps/web/tests/unit/components/features/admin/hud/OperationalTasksPanel.test.tsx
import { Button } from '@jovie/ui';
import {
  CircleAlert,
  CircleCheck,
  Clock3,
  GitPullRequest,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import {
  type ComponentType,
  type ReactNode,
  type SVGProps,
  useMemo,
  useState,
} from 'react';
import { HudStatusPill } from '@/app/app/(shell)/admin/ops/HudStatusPill';
import {
  buildMatrixRows,
  ShippingRowRail,
} from '@/app/app/(shell)/admin/shipping/ShippingMatrix';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { TaskProjectionListRow } from '@/components/organisms/table';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import type { ShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';
import { cn } from '@/lib/utils';
import { useHudShippingStateQuery } from './useHudShippingStateQuery';

type OperationalTaskFeed = ShippingCockpitProjection['operationalTasks'];
type OperationalTask = OperationalTaskFeed['tasks'][number];
type WorkflowVisual = {
  readonly label: string;
  readonly className: string;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
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

function RegisteredTaskRail({ panel }: Readonly<{ panel: ReactNode }>) {
  useRegisterRightPanel(panel);
  return null;
}

export function OperationalTasksPanelView({
  feed,
  requestState = 'idle',
  presentation = 'section',
  selectedTaskId = null,
  onSelectTask,
}: Readonly<{
  readonly feed: OperationalTaskFeed;
  readonly requestState?: 'idle' | 'fetching' | 'error';
  readonly presentation?: 'section' | 'page';
  readonly selectedTaskId?: OperationalTask['id'] | null;
  readonly onSelectTask?: (taskId: OperationalTask['id'] | null) => void;
}>) {
  const Surface = presentation === 'page' ? 'section' : ContentSurfaceCard;
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
  const rows = buildMatrixRows(feed, Date.now());
  const selectedRow = rows.find(row => row.id === selectedTaskId) ?? null;
  const taskRail = useMemo(
    () => (
      <ShippingRowRail row={selectedRow} onClose={() => onSelectTask?.(null)} />
    ),
    [selectedRow, onSelectTask]
  );

  return (
    <>
      <Surface
        {...(presentation === 'section' ? { surface: 'details' as const } : {})}
        aria-label='Operational Tasks'
        className={presentation === 'section' ? 'overflow-hidden' : undefined}
        data-testid='ovie-operational-tasks'
      >
        <div
          className={cn(
            'flex min-h-16 items-center justify-between gap-3 py-2',
            presentation === 'section' && 'border-b border-subtle px-3'
          )}
        >
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
        <div
          className={
            presentation === 'section' ? 'h-72 overflow-y-auto p-2' : undefined
          }
          aria-live='polite'
        >
          {feed.tasks.length === 0 ? (
            <div className='grid min-h-32 h-full place-items-center text-center'>
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
                    ? `${workflowVisual(delta.fromState).label} → ${delta.toState ? workflowVisual(delta.toState).label : 'Removed'}`
                    : 'New'
                  : null;
                return (
                  <TaskProjectionListRow
                    key={task.id}
                    testId={`operational-task-${task.id}`}
                    isSelected={selectedTaskId === task.id}
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
                    title={
                      task.linearUrl ? (
                        <a
                          href={task.linearUrl}
                          title={task.title}
                          className='hover:underline focus-visible:underline'
                        >
                          {task.title}
                        </a>
                      ) : (
                        task.title
                      )
                    }
                    metadata={
                      <div className='mt-px flex min-w-0 flex-wrap items-center gap-x-1.5 overflow-hidden text-3xs leading-4 text-tertiary-token'>
                        <span className='font-medium text-secondary-token'>
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
                        {transition == null ? null : <span>{transition}</span>}
                      </div>
                    }
                    actionSlot={
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        aria-expanded={selectedTaskId === task.id}
                        aria-label={`Inspect ${task.linearIdentifier}: ${task.title}`}
                        onClick={() =>
                          onSelectTask?.(
                            selectedTaskId === task.id ? null : task.id
                          )
                        }
                      >
                        Inspect
                      </Button>
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      </Surface>
      {presentation === 'page' ? (
        <RegisteredTaskRail panel={taskRail} />
      ) : (
        taskRail
      )}
    </>
  );
}

export function OperationalTasksPanel({
  kioskToken = null,
  presentation = 'section',
}: Readonly<{
  readonly kioskToken?: string | null;
  readonly presentation?: 'section' | 'page';
}>) {
  const [selectedTaskId, setSelectedTaskId] = useState<
    OperationalTask['id'] | null
  >(null);
  const query = useHudShippingStateQuery(kioskToken);
  const requestState = query.isFetching
    ? 'fetching'
    : query.operationalRequestState === 'error'
      ? 'error'
      : 'idle';
  return (
    <OperationalTasksPanelView
      presentation={presentation}
      feed={query.operationalTasks}
      requestState={requestState}
      selectedTaskId={selectedTaskId}
      onSelectTask={setSelectedTaskId}
    />
  );
}
