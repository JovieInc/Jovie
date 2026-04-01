'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
} from '@jovie/ui';
import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { Check, ChevronDown, Plus, Search } from 'lucide-react';
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
import {
  PAGE_TOOLBAR_MENU_TRIGGER_CLASS,
  PageToolbar,
  PageToolbarActionButton,
  UnifiedTable,
} from '@/components/organisms/table';
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
import {
  type AccentPaletteName,
  getAccentCssVars,
} from '@/lib/ui/accent-palette';
import { cn } from '@/lib/utils';

const columnHelper = createColumnHelper<TaskView>();

const STATUS_META: Record<
  TaskStatus,
  {
    readonly label: string;
    readonly accent: AccentPaletteName;
  }
> = {
  backlog: {
    label: 'Backlog',
    accent: 'gray',
  },
  todo: {
    label: 'Todo',
    accent: 'blue',
  },
  in_progress: {
    label: 'In Progress',
    accent: 'purple',
  },
  done: {
    label: 'Done',
    accent: 'green',
  },
  cancelled: {
    label: 'Cancelled',
    accent: 'red',
  },
};

const PRIORITY_META: Record<
  TaskPriority,
  {
    readonly label: string;
    readonly symbol: string;
    readonly accent: AccentPaletteName;
  }
> = {
  urgent: {
    label: 'Urgent',
    symbol: '!!!',
    accent: 'red',
  },
  high: {
    label: 'High',
    symbol: '!!',
    accent: 'orange',
  },
  medium: {
    label: 'Medium',
    symbol: '!',
    accent: 'purple',
  },
  low: { label: 'Low', symbol: '-', accent: 'teal' },
  none: { label: 'None', symbol: '', accent: 'gray' },
};

function StatusDotCell({
  task,
  onToggle,
}: Readonly<{
  task: TaskView;
  onToggle: (task: TaskView) => void;
}>) {
  const meta = STATUS_META[task.status];
  const accent = getAccentCssVars(meta.accent);

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
      <span
        className='h-2 w-2 rounded-full'
        style={{ backgroundColor: accent.solid }}
      />
    </button>
  );
}

function ToolbarFilterMenu<TValue extends string>({
  label,
  value,
  options,
  onChange,
  ariaLabel,
}: Readonly<{
  label: string;
  value: TValue | 'all';
  options: readonly { value: TValue | 'all'; label: string }[];
  onChange: (value: TValue | 'all') => void;
  ariaLabel: string;
}>) {
  const selectedLabel =
    options.find(option => option.value === value)?.label ?? label;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          aria-label={ariaLabel}
          className={cn(
            PAGE_TOOLBAR_MENU_TRIGGER_CLASS,
            'h-7 min-w-[132px] rounded-full'
          )}
        >
          <span className='truncate'>{selectedLabel}</span>
          <ChevronDown className='h-3.5 w-3.5 text-tertiary-token' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start' sideOffset={8}>
        {options.map(option => {
          const active = option.value === value;
          return (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => onChange(option.value)}
            >
              <span className='mr-2 inline-flex w-4 items-center justify-center'>
                {active ? <Check className='h-3.5 w-3.5' /> : null}
              </span>
              {option.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatusBadgeCell({ status }: Readonly<{ status: TaskStatus }>) {
  const meta = STATUS_META[status];
  const accent = getAccentCssVars(meta.accent);

  return (
    <span
      className='inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-[560]'
      style={{
        backgroundColor: accent.subtle,
        borderColor: `color-mix(in oklab, ${accent.solid} 24%, var(--linear-app-frame-seam))`,
        color: accent.solid,
      }}
    >
      {meta.label}
    </span>
  );
}

function PriorityCell({ priority }: Readonly<{ priority: TaskPriority }>) {
  const meta = PRIORITY_META[priority];
  const accent = getAccentCssVars(meta.accent);

  if (!meta.symbol) {
    return <span className='text-[12px] text-tertiary-token'>-</span>;
  }

  return (
    <span
      role='img'
      className='text-[12px] font-[560] tracking-[0.04em]'
      style={{ color: accent.solid }}
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
  const jovieAccent = getAccentCssVars('pink');

  return (
    <span
      role='img'
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-[560]',
        assigneeKind === 'jovie' ? '' : 'bg-surface-1 text-secondary-token'
      )}
      style={
        assigneeKind === 'jovie'
          ? {
              backgroundColor: jovieAccent.subtle,
              color: jovieAccent.solid,
            }
          : undefined
      }
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
              <p className='truncate text-[13px] font-[510] leading-[17px] text-primary-token'>
                {info.getValue()}
              </p>
              {info.row.original.description ? (
                <p className='truncate pt-0.5 text-[11.5px] leading-[15px] text-secondary-token'>
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
            <span className='truncate text-[11.5px] leading-[15px] text-secondary-token'>
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
      <section
        className='flex min-h-0 flex-1 flex-col overflow-hidden'
        data-testid='tasks-content-panel'
      >
        {isComposerOpen ? (
          <form
            onSubmit={handleCreateTask}
            className='flex items-center gap-2 border-b border-subtle px-app-header py-2.5'
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
              <div className='relative min-w-0 flex-1 max-w-[320px]'>
                <Search className='pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tertiary-token' />
                <Input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder='Search Tasks'
                  className='h-8 pl-8 text-[12px]'
                />
              </div>
              <ToolbarFilterMenu
                label='Status'
                value={statusFilter}
                ariaLabel='Filter by status'
                onChange={value => setStatusFilter(value as TaskStatus | 'all')}
                options={[
                  { value: 'all', label: 'All Statuses' },
                  { value: 'backlog', label: 'Backlog' },
                  { value: 'todo', label: 'Todo' },
                  { value: 'in_progress', label: 'In Progress' },
                  { value: 'done', label: 'Done' },
                  { value: 'cancelled', label: 'Cancelled' },
                ]}
              />
              <ToolbarFilterMenu
                label='Priority'
                value={priorityFilter}
                ariaLabel='Filter by priority'
                onChange={value =>
                  setPriorityFilter(value as TaskPriority | 'all')
                }
                options={[
                  { value: 'all', label: 'All Priorities' },
                  { value: 'urgent', label: 'Urgent' },
                  { value: 'high', label: 'High' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'low', label: 'Low' },
                  { value: 'none', label: 'None' },
                ]}
              />
              <ToolbarFilterMenu
                label='Assignee'
                value={assigneeFilter}
                ariaLabel='Filter by assignee'
                onChange={value =>
                  setAssigneeFilter(value as TaskAssigneeKind | 'all')
                }
                options={[
                  { value: 'all', label: 'All Assignees' },
                  { value: 'human', label: 'You' },
                  { value: 'jovie', label: 'Jovie' },
                ]}
              />
            </div>
          }
          end={
            <PageToolbarActionButton
              label='New Task'
              icon={<Plus className='h-3.5 w-3.5' />}
              iconOnly
              tooltipLabel={isComposerOpen ? 'Close task composer' : 'New Task'}
              ariaLabel={
                isComposerOpen ? 'Close task composer' : 'Create new task'
              }
              active={isComposerOpen}
              onClick={() => setIsComposerOpen(value => !value)}
            />
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
              containerClassName='h-full px-2 pb-2 pt-0.5'
              getRowClassName={row =>
                cn(
                  'rounded-none border-b border-[color-mix(in_oklab,var(--linear-app-frame-seam)_56%,transparent)] transition-colors',
                  row.status === 'done'
                    ? 'opacity-72'
                    : 'hover:bg-[color-mix(in_oklab,var(--linear-row-hover)_72%,transparent)]'
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
    </DashboardWorkspacePanel>
  );
}
