'use client';

import { Button, Input } from '@jovie/ui';
import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { Plus, Search } from 'lucide-react';
import {
  type FormEvent,
  startTransition,
  useDeferredValue,
  useMemo,
  useState,
} from 'react';
import { toast } from 'sonner';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { DashboardWorkspacePanel } from '@/components/features/dashboard/organisms/DashboardWorkspacePanel';
import { ReleaseTaskDueBadge } from '@/components/features/dashboard/release-tasks/ReleaseTaskDueBadge';
import { LINEAR_SURFACE } from '@/components/features/dashboard/tokens';
import { PageToolbar, UnifiedTable } from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import {
  useCreateTaskMutation,
  useUpdateTaskMutation,
} from '@/lib/queries/useTaskMutations';
import { useTasksQuery } from '@/lib/queries/useTasksQuery';
import type {
  TaskAssigneeKind,
  TaskPriority,
  TaskStatus,
  TaskView,
} from '@/lib/tasks/types';
import { cn } from '@/lib/utils';

const columnHelper = createColumnHelper<TaskView>();

const STATUS_META: Record<
  TaskStatus,
  {
    readonly label: string;
    readonly dotClassName: string;
    readonly badgeClassName: string;
  }
> = {
  backlog: {
    label: 'Backlog',
    dotClassName: 'bg-tertiary-token/60',
    badgeClassName: 'bg-surface-1 text-tertiary-token',
  },
  todo: {
    label: 'Todo',
    dotClassName: 'bg-sky-500',
    badgeClassName: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  in_progress: {
    label: 'In Progress',
    dotClassName: 'bg-amber-500',
    badgeClassName: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  done: {
    label: 'Done',
    dotClassName: 'bg-emerald-500',
    badgeClassName: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  cancelled: {
    label: 'Cancelled',
    dotClassName: 'bg-red-500',
    badgeClassName: 'bg-red-500/10 text-red-700 dark:text-red-300',
  },
};

const PRIORITY_META: Record<
  TaskPriority,
  {
    readonly label: string;
    readonly symbol: string;
    readonly className: string;
  }
> = {
  urgent: {
    label: 'Urgent',
    symbol: '!!!',
    className: 'text-red-600 dark:text-red-400',
  },
  high: {
    label: 'High',
    symbol: '!!',
    className: 'text-orange-600 dark:text-orange-400',
  },
  medium: {
    label: 'Medium',
    symbol: '!',
    className: 'text-amber-600 dark:text-amber-400',
  },
  low: { label: 'Low', symbol: '-', className: 'text-tertiary-token' },
  none: { label: 'None', symbol: '', className: 'text-tertiary-token' },
};

const FILTER_SELECT_CLASS =
  'h-8 rounded-md border border-subtle bg-surface-0 px-2.5 text-[12px] font-[510] text-secondary-token outline-none transition-colors focus:border-default focus:text-primary-token';

function StatusDotCell({
  task,
  onToggle,
}: Readonly<{
  task: TaskView;
  onToggle: (task: TaskView) => void;
}>) {
  const meta = STATUS_META[task.status];

  return (
    <button
      type='button'
      onClick={event => {
        event.stopPropagation();
        onToggle(task);
      }}
      className='flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-surface-1'
      aria-label={`Status: ${meta.label}`}
      title={meta.label}
    >
      <span className={cn('h-2 w-2 rounded-full', meta.dotClassName)} />
    </button>
  );
}

function StatusBadgeCell({ status }: Readonly<{ status: TaskStatus }>) {
  const meta = STATUS_META[status];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-[560]',
        meta.badgeClassName
      )}
    >
      {meta.label}
    </span>
  );
}

function PriorityCell({ priority }: Readonly<{ priority: TaskPriority }>) {
  const meta = PRIORITY_META[priority];

  if (!meta.symbol) {
    return <span className='text-[12px] text-tertiary-token'>-</span>;
  }

  return (
    <span
      role='img'
      className={cn('text-[12px] font-[560] tracking-[0.04em]', meta.className)}
      aria-label={`Priority: ${meta.label}`}
      title={`Priority: ${meta.label}`}
    >
      {meta.symbol}
    </span>
  );
}

function AssigneeCell({
  assigneeKind,
}: Readonly<{ assigneeKind: TaskAssigneeKind }>) {
  return (
    <span
      role='img'
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-[560]',
        assigneeKind === 'jovie'
          ? 'bg-[var(--linear-accent,#5e6ad2)]/10 text-[var(--linear-accent,#5e6ad2)]'
          : 'bg-surface-1 text-secondary-token'
      )}
      aria-label={`Assignee: ${assigneeKind === 'jovie' ? 'Jovie' : 'You'}`}
    >
      {assigneeKind === 'jovie' ? 'Jovie' : 'You'}
    </span>
  );
}

function TaskEmptyState({
  hasFilters,
  onClearFilters,
  onOpenComposer,
}: Readonly<{
  hasFilters: boolean;
  onClearFilters: () => void;
  onOpenComposer: () => void;
}>) {
  return (
    <div className='flex min-h-[320px] flex-col items-center justify-center gap-3 px-6 text-center'>
      <div className='space-y-1'>
        <h2 className='text-[15px] font-[560] text-primary-token'>
          {hasFilters
            ? 'No Tasks Match Your Filters'
            : 'Your Task List Is Empty'}
        </h2>
        <p className='max-w-[520px] text-[13px] text-secondary-token'>
          {hasFilters
            ? 'Try widening the filters or search query.'
            : 'Create your first task, or tasks will appear automatically when you set up a release.'}
        </p>
      </div>
      <div className='flex items-center gap-2'>
        {hasFilters ? (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={onClearFilters}
          >
            Clear Filters
          </Button>
        ) : (
          <>
            <Button type='button' size='sm' onClick={onOpenComposer}>
              New Task
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={() => {
                globalThis.location.href = APP_ROUTES.DASHBOARD_RELEASES;
              }}
            >
              Set Up Release
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function TasksPageClient() {
  const { selectedProfile } = useDashboardData();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>(
    'all'
  );
  const [assigneeFilter, setAssigneeFilter] = useState<
    TaskAssigneeKind | 'all'
  >('all');
  const [draftTitle, setDraftTitle] = useState('');
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const profileId = selectedProfile?.id;
  const createTaskMutation = useCreateTaskMutation();
  const updateTaskMutation = useUpdateTaskMutation();

  const filters = useMemo(
    () => ({
      search: deferredSearch.trim() || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
      priority: priorityFilter === 'all' ? undefined : priorityFilter,
      assigneeKind: assigneeFilter === 'all' ? undefined : assigneeFilter,
    }),
    [assigneeFilter, deferredSearch, priorityFilter, statusFilter]
  );

  const { data, isLoading, isError, refetch } = useTasksQuery(
    profileId,
    filters
  );
  const tasks = data?.tasks ?? [];
  const hasFilters =
    Boolean(deferredSearch.trim()) ||
    statusFilter !== 'all' ||
    priorityFilter !== 'all' ||
    assigneeFilter !== 'all';

  const columns = useMemo(
    () =>
      [
        columnHelper.display({
          id: 'statusDot',
          header: '',
          size: 44,
          enableSorting: false,
          cell: info => (
            <StatusDotCell
              task={info.row.original}
              onToggle={task => {
                updateTaskMutation.mutate({
                  taskId: task.id,
                  data: { status: task.status === 'done' ? 'todo' : 'done' },
                });
              }}
            />
          ),
          meta: { className: 'pl-3 pr-1' },
        }),
        columnHelper.accessor('taskNumber', {
          id: 'taskNumber',
          header: 'Task',
          size: 92,
          cell: info => (
            <span className='text-[12px] text-tertiary-token'>
              J-{info.getValue()}
            </span>
          ),
          meta: { className: 'px-1' },
        }),
        columnHelper.accessor('title', {
          id: 'title',
          header: 'Title',
          size: 9999,
          cell: info => (
            <div className='min-w-0'>
              <p className='truncate text-[13px] font-[510] text-primary-token'>
                {info.getValue()}
              </p>
              {info.row.original.description ? (
                <p className='truncate text-[12px] text-secondary-token'>
                  {info.row.original.description}
                </p>
              ) : null}
            </div>
          ),
          meta: { className: 'px-1' },
        }),
        columnHelper.accessor('status', {
          id: 'status',
          header: 'Status',
          size: 120,
          cell: info => <StatusBadgeCell status={info.getValue()} />,
          meta: { className: 'px-1' },
        }),
        columnHelper.accessor('priority', {
          id: 'priority',
          header: 'Priority',
          size: 84,
          cell: info => <PriorityCell priority={info.getValue()} />,
          meta: { className: 'px-1' },
        }),
        columnHelper.accessor('assigneeKind', {
          id: 'assigneeKind',
          header: 'Assignee',
          size: 100,
          cell: info => <AssigneeCell assigneeKind={info.getValue()} />,
          meta: { className: 'px-1' },
        }),
        columnHelper.accessor('dueAt', {
          id: 'dueAt',
          header: 'Due',
          size: 92,
          cell: info => (
            <ReleaseTaskDueBadge
              dueDate={info.getValue()}
              dueDaysOffset={null}
              isCompleted={info.row.original.status === 'done'}
            />
          ),
          meta: { className: 'px-1' },
        }),
        columnHelper.accessor('releaseTitle', {
          id: 'release',
          header: 'Release',
          size: 180,
          cell: info => (
            <span className='truncate text-[12px] text-secondary-token'>
              {info.getValue() ?? 'General'}
            </span>
          ),
          meta: { className: 'px-1 pr-3' },
        }),
      ] as ColumnDef<TaskView, unknown>[],
    [updateTaskMutation]
  );

  const handleCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const title = draftTitle.trim();
    if (!title) {
      return;
    }

    try {
      await createTaskMutation.mutateAsync({ title });
      setDraftTitle('');
      startTransition(() => {
        setIsComposerOpen(false);
      });
      toast.success('Task created');
    } catch {
      toast.error("Couldn't create task");
    }
  };

  return (
    <DashboardWorkspacePanel
      className='overflow-hidden'
      data-testid='tasks-workspace'
    >
      <div className='flex min-h-0 flex-1 flex-col px-3 py-3 sm:px-4 sm:py-4'>
        <section
          className={cn(
            LINEAR_SURFACE.contentContainer,
            'flex min-h-0 flex-1 flex-col overflow-hidden'
          )}
          data-testid='tasks-content-panel'
        >
          <div className='flex items-center justify-between gap-3 border-b border-subtle px-app-header py-3'>
            <div className='min-w-0'>
              <h1 className='text-[13px] font-[560] text-primary-token'>
                Tasks
              </h1>
              <p className='text-[12px] text-secondary-token'>
                Track release work and general artist operations.
              </p>
            </div>
            <Button
              type='button'
              size='sm'
              className='gap-1.5'
              onClick={() => setIsComposerOpen(value => !value)}
            >
              <Plus className='h-3.5 w-3.5' />
              New Task
            </Button>
          </div>

          {isComposerOpen ? (
            <form
              onSubmit={handleCreateTask}
              className='flex items-center gap-2 border-b border-subtle px-app-header py-3'
            >
              <Input
                value={draftTitle}
                onChange={event => setDraftTitle(event.target.value)}
                placeholder='Draft press release, update bio, pitch sync supervisor...'
                autoFocus
              />
              <Button
                type='submit'
                size='sm'
                disabled={createTaskMutation.isPending}
              >
                Create
              </Button>
              <Button
                type='button'
                variant='secondary'
                size='sm'
                onClick={() => {
                  setDraftTitle('');
                  setIsComposerOpen(false);
                }}
              >
                Cancel
              </Button>
            </form>
          ) : null}

          <PageToolbar
            start={
              <div className='flex min-w-0 flex-1 items-center gap-2'>
                <div className='relative min-w-0 flex-1 max-w-[280px]'>
                  <Search className='pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tertiary-token' />
                  <Input
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder='Search Tasks'
                    className='h-8 pl-8 text-[12px]'
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={event =>
                    setStatusFilter(event.target.value as TaskStatus | 'all')
                  }
                  className={FILTER_SELECT_CLASS}
                  aria-label='Filter by status'
                >
                  <option value='all'>All Statuses</option>
                  <option value='backlog'>Backlog</option>
                  <option value='todo'>Todo</option>
                  <option value='in_progress'>In Progress</option>
                  <option value='done'>Done</option>
                  <option value='cancelled'>Cancelled</option>
                </select>
                <select
                  value={priorityFilter}
                  onChange={event =>
                    setPriorityFilter(
                      event.target.value as TaskPriority | 'all'
                    )
                  }
                  className={FILTER_SELECT_CLASS}
                  aria-label='Filter by priority'
                >
                  <option value='all'>All Priorities</option>
                  <option value='urgent'>Urgent</option>
                  <option value='high'>High</option>
                  <option value='medium'>Medium</option>
                  <option value='low'>Low</option>
                  <option value='none'>None</option>
                </select>
                <select
                  value={assigneeFilter}
                  onChange={event =>
                    setAssigneeFilter(
                      event.target.value as TaskAssigneeKind | 'all'
                    )
                  }
                  className={FILTER_SELECT_CLASS}
                  aria-label='Filter by assignee'
                >
                  <option value='all'>All Assignees</option>
                  <option value='human'>You</option>
                  <option value='jovie'>Jovie</option>
                </select>
              </div>
            }
          />

          {isError ? (
            <div className='flex min-h-[240px] flex-1 flex-col items-center justify-center gap-3 px-6 text-center'>
              <div className='space-y-1'>
                <h2 className='text-[15px] font-[560] text-primary-token'>
                  Couldn&apos;t Load Tasks
                </h2>
                <p className='text-[13px] text-secondary-token'>
                  Try reloading the task list.
                </p>
              </div>
              <Button
                type='button'
                variant='secondary'
                size='sm'
                onClick={() => void refetch()}
              >
                Retry
              </Button>
            </div>
          ) : (
            <div className='min-h-0 flex-1'>
              <UnifiedTable
                data={tasks}
                columns={columns}
                isLoading={isLoading}
                getRowId={row => row.id}
                enableVirtualization={false}
                rowHeight={38}
                skeletonRows={8}
                className='text-[13px]'
                containerClassName='h-full px-2 pb-2 pt-1'
                getRowClassName={row =>
                  cn(
                    'rounded-[10px] transition-colors',
                    row.status === 'done'
                      ? 'opacity-70'
                      : 'hover:bg-[color-mix(in_oklab,var(--linear-row-hover)_78%,transparent)]'
                  )
                }
                emptyState={
                  <TaskEmptyState
                    hasFilters={hasFilters}
                    onClearFilters={() => {
                      setSearch('');
                      setStatusFilter('all');
                      setPriorityFilter('all');
                      setAssigneeFilter('all');
                    }}
                    onOpenComposer={() => setIsComposerOpen(true)}
                  />
                }
              />
            </div>
          )}
        </section>
      </div>
    </DashboardWorkspacePanel>
  );
}
