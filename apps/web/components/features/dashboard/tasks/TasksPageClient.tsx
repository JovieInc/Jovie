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
import {
  Bot,
  Check,
  ChevronDown,
  FileText,
  Flag,
  MoreVertical,
  Plus,
  Search,
  User,
  X,
} from 'lucide-react';
import {
  type FormEvent,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { toast } from 'sonner';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { providerConfig } from '@/app/app/(shell)/dashboard/releases/config';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import { DashboardWorkspacePanel } from '@/components/features/dashboard/organisms/DashboardWorkspacePanel';
import { ReleaseTaskDueBadge } from '@/components/features/dashboard/release-tasks/ReleaseTaskDueBadge';
import { ReleaseSidebar } from '@/components/organisms/release-sidebar';
import {
  type ContextMenuItemType,
  convertContextMenuItems,
  PAGE_TOOLBAR_MENU_TRIGGER_CLASS,
  PageToolbar,
  PageToolbarActionButton,
  UnifiedTable,
} from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import { useReleasesQuery } from '@/lib/queries/useReleasesQuery';
import {
  useCreateTaskMutation,
  useUpdateTaskMutation,
} from '@/lib/queries/useTaskMutations';
import { useTaskQuery, useTasksQuery } from '@/lib/queries/useTasksQuery';
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
    accent: 'orange',
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
    accent: 'pink',
  },
  cancelled: {
    label: 'Cancelled',
    accent: 'gray',
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
    symbol: 'Urgent',
    accent: 'pink',
  },
  high: {
    label: 'High',
    symbol: 'High',
    accent: 'orange',
  },
  medium: {
    label: 'Medium',
    symbol: 'Medium',
    accent: 'purple',
  },
  low: { label: 'Low', symbol: 'Low', accent: 'blue' },
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
      className='inline-flex min-w-[86px] items-center justify-center rounded-full px-2.5 py-1 text-[10.5px] font-[600] tracking-[0.02em]'
      style={{
        backgroundColor: `color-mix(in oklab, ${accent.solid} 18%, var(--linear-surface-elevated))`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${accent.solid} 26%, transparent)`,
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
    return <span className='text-[11px] text-tertiary-token'>-</span>;
  }

  return (
    <span
      className='inline-flex items-center rounded-full px-2.5 py-1 text-[10.5px] font-[600]'
      style={{
        backgroundColor: `color-mix(in oklab, ${accent.solid} 14%, var(--linear-surface-elevated))`,
        color: accent.solid,
      }}
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

function resolveArtistName(
  profile: Readonly<{
    display_name?: string | null;
    username_normalized?: string | null;
    username?: string | null;
  }> | null
): string | null {
  return (
    profile?.display_name ??
    profile?.username_normalized ??
    profile?.username ??
    null
  );
}

function TaskTitleCellContent({
  task,
  onOpenRelease,
}: Readonly<{
  task: TaskView;
  onOpenRelease: (task: TaskView) => void;
}>) {
  const shouldShowAssignee = task.assigneeKind === 'jovie';

  return (
    <div className='min-w-0 py-2'>
      <div className='flex min-w-0 items-center gap-2'>
        <p className='truncate text-[13px] font-[560] leading-[17px] text-primary-token'>
          {task.title}
        </p>
      </div>
      <div className='flex min-w-0 items-center gap-2 pt-1'>
        <span className='shrink-0 text-[11px] font-[560] text-tertiary-token'>
          J-{task.taskNumber}
        </span>
        {task.releaseTitle ? (
          <>
            <span className='h-1 w-1 shrink-0 rounded-full bg-[color-mix(in_oklab,var(--text-tertiary)_72%,transparent)]' />
            <button
              type='button'
              onClick={event => {
                event.stopPropagation();
                onOpenRelease(task);
              }}
              className='truncate rounded-full px-2 py-0.5 text-[11px] font-[560] text-secondary-token transition-colors hover:bg-surface-1 hover:text-primary-token'
            >
              {task.releaseTitle}
            </button>
          </>
        ) : null}
        {shouldShowAssignee ? (
          <>
            <span className='h-1 w-1 shrink-0 rounded-full bg-[color-mix(in_oklab,var(--text-tertiary)_72%,transparent)]' />
            <AssigneeCell assigneeKind={task.assigneeKind} />
          </>
        ) : null}
      </div>
      {task.description ? (
        <p className='truncate pt-1 text-[11.5px] leading-[15px] text-secondary-token'>
          {task.description}
        </p>
      ) : null}
    </div>
  );
}

function TaskDocumentPanel({
  task,
  title,
  description,
  onTitleChange,
  onDescriptionChange,
  onClose,
  onSave,
  onOpenRelease,
  isSaving,
}: Readonly<{
  task: TaskView | null;
  title: string;
  description: string;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  onOpenRelease: (task: TaskView) => void;
  isSaving: boolean;
}>) {
  if (!task) {
    return (
      <div className='flex min-h-0 flex-1 items-center justify-center px-8'>
        <div className='max-w-md text-center'>
          <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-[14px] border border-subtle bg-surface-1 text-secondary-token'>
            <FileText className='h-5 w-5' />
          </div>
          <h2 className='mt-4 text-[16px] font-[590] text-primary-token'>
            Select a Task to Open Its Document
          </h2>
          <p className='mt-1 text-[13px] leading-[19px] text-secondary-token'>
            Tasks now open into a central writing surface so the brief,
            instructions, and agent context live with the work instead of being
            buried in a table row.
          </p>
        </div>
      </div>
    );
  }

  const hasRelease = Boolean(task.releaseId && task.releaseTitle);

  return (
    <div className='flex min-h-0 min-w-0 flex-1 flex-col bg-surface-0'>
      <div className='flex items-center justify-between border-b border-subtle px-6 py-3'>
        <div className='flex min-w-0 items-center gap-2'>
          <span className='rounded-full bg-surface-1 px-2.5 py-1 text-[10.5px] font-[600] text-tertiary-token'>
            J-{task.taskNumber}
          </span>
          <StatusBadgeCell status={task.status} />
          <PriorityCell priority={task.priority} />
          <AssigneeCell assigneeKind={task.assigneeKind} />
          {task.dueAt ? (
            <ReleaseTaskDueBadge
              dueDate={task.dueAt}
              dueDaysOffset={null}
              isCompleted={task.status === 'done'}
            />
          ) : null}
          {hasRelease ? (
            <button
              type='button'
              onClick={() => onOpenRelease(task)}
              className='truncate rounded-full bg-surface-1 px-2.5 py-1 text-[10.5px] font-[600] text-secondary-token transition-colors hover:text-primary-token'
            >
              {task.releaseTitle}
            </button>
          ) : null}
        </div>
        <div className='flex items-center gap-2'>
          <Button type='button' variant='secondary' size='sm' onClick={onClose}>
            <X className='mr-1 h-3.5 w-3.5' />
            Close
          </Button>
          <Button type='button' size='sm' onClick={onSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Task'}
          </Button>
        </div>
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto'>
        <div className='mx-auto flex max-w-4xl flex-col px-8 py-8'>
          <input
            value={title}
            onChange={event => onTitleChange(event.target.value)}
            placeholder='Untitled Task'
            className='w-full border-0 bg-transparent px-0 text-[30px] font-[620] tracking-[-0.03em] text-primary-token outline-none placeholder:text-[color-mix(in_oklab,var(--text-tertiary)_80%,transparent)]'
          />

          <div className='mt-6 rounded-[20px] border border-subtle bg-surface-1 p-5'>
            <div className='flex items-center gap-2 text-[11px] font-[600] uppercase tracking-[0.12em] text-tertiary-token'>
              <Bot className='h-3.5 w-3.5' />
              Agent Context
            </div>
            <p className='mt-2 text-[13px] leading-[20px] text-secondary-token'>
              Treat this like the working brief for the task. Add decision
              context, references, rollout notes, edge cases, or exact output
              requirements so agents have durable context when the task is
              assigned.
            </p>
          </div>

          <div className='mt-6 rounded-[24px] border border-[color-mix(in_oklab,var(--linear-app-frame-seam)_72%,transparent)] bg-[color-mix(in_oklab,var(--linear-surface-elevated)_82%,var(--linear-surface))] px-6 py-6'>
            <label
              htmlFor='task-context-editor'
              className='text-[11px] font-[600] uppercase tracking-[0.12em] text-tertiary-token'
            >
              Task Context
            </label>
            <textarea
              id='task-context-editor'
              value={description}
              onChange={event => onDescriptionChange(event.target.value)}
              placeholder='Write the brief, constraints, notes, deliverables, and any context an assignee or agent should keep in mind.'
              className='mt-3 min-h-[460px] w-full resize-none border-0 bg-transparent px-0 text-[15px] leading-[1.8] text-primary-token outline-none placeholder:text-[color-mix(in_oklab,var(--text-tertiary)_82%,transparent)]'
            />
          </div>
        </div>
      </div>
    </div>
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
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(
    null
  );
  const [editorTitle, setEditorTitle] = useState('');
  const [editorDescription, setEditorDescription] = useState('');
  const deferredSearch = useDeferredValue(search);
  const profileId = selectedProfile?.id;
  const createTaskMutation = useCreateTaskMutation();
  const updateTaskMutation = useUpdateTaskMutation();
  const { data: releases = [] } = useReleasesQuery(profileId ?? '');

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
  const { data: selectedTaskData } = useTaskQuery(selectedTaskId, profileId);
  const tasks = data?.tasks ?? [];
  const selectedTask =
    selectedTaskData ?? tasks.find(task => task.id === selectedTaskId) ?? null;
  const selectedRelease =
    releases.find(release => release.id === selectedReleaseId) ?? null;
  const artistName = resolveArtistName(selectedProfile);
  const hasFilters =
    Boolean(deferredSearch.trim()) ||
    statusFilter !== 'all' ||
    priorityFilter !== 'all' ||
    assigneeFilter !== 'all';

  useEffect(() => {
    if (!selectedTask) {
      setEditorTitle('');
      setEditorDescription('');
      return;
    }

    setEditorTitle(selectedTask.title);
    setEditorDescription(selectedTask.description ?? '');
  }, [selectedTask]);

  const openReleaseSidebar = useCallback((task: TaskView) => {
    if (task.releaseId) {
      setSelectedReleaseId(task.releaseId);
    }
  }, []);

  const openTaskDocument = useCallback((task: TaskView) => {
    setIsComposerOpen(false);
    setSelectedTaskId(task.id);
  }, []);

  const handleSaveTaskDocument = useCallback(async () => {
    if (!selectedTask) {
      return;
    }

    const nextTitle = editorTitle.trim();
    if (!nextTitle) {
      toast.error('Task title is required');
      return;
    }

    try {
      await updateTaskMutation.mutateAsync({
        taskId: selectedTask.id,
        data: {
          title: nextTitle,
          description: editorDescription.trim() || null,
        },
      });
      toast.success('Task updated');
    } catch {
      toast.error("Couldn't update task");
    }
  }, [editorDescription, editorTitle, selectedTask, updateTaskMutation]);

  const getTaskContextMenuItems = useCallback(
    (task: TaskView): ContextMenuItemType[] => [
      {
        id: 'open-task',
        label: 'Open Task',
        icon: <FileText className='h-4 w-4' />,
        onClick: () => openTaskDocument(task),
      },
      ...(task.releaseId
        ? [
            {
              id: 'open-release',
              label: 'Open Release',
              icon: <FileText className='h-4 w-4' />,
              onClick: () => openReleaseSidebar(task),
            } satisfies ContextMenuItemType,
            { type: 'separator' } satisfies ContextMenuItemType,
          ]
        : []),
      {
        id: 'change-status',
        label: 'Change Status',
        icon: <Check className='h-4 w-4' />,
        items: (
          Object.entries(STATUS_META) as Array<
            [TaskStatus, (typeof STATUS_META)[TaskStatus]]
          >
        ).map(([value, meta]) => ({
          id: `status-${value}`,
          label: meta.label,
          onClick: () =>
            updateTaskMutation.mutate({
              taskId: task.id,
              data: { status: value },
            }),
          disabled: task.status === value,
        })),
      },
      {
        id: 'change-priority',
        label: 'Change Priority',
        icon: <Flag className='h-4 w-4' />,
        items: (
          Object.entries(PRIORITY_META) as Array<
            [TaskPriority, (typeof PRIORITY_META)[TaskPriority]]
          >
        ).map(([value, meta]) => ({
          id: `priority-${value}`,
          label: meta.label,
          onClick: () =>
            updateTaskMutation.mutate({
              taskId: task.id,
              data: { priority: value },
            }),
          disabled: task.priority === value,
        })),
      },
      {
        id: 'change-assignee',
        label: 'Change Assignee',
        icon:
          task.assigneeKind === 'jovie' ? (
            <Bot className='h-4 w-4' />
          ) : (
            <User className='h-4 w-4' />
          ),
        items: [
          {
            id: 'assignee-human',
            label: 'You',
            onClick: () =>
              updateTaskMutation.mutate({
                taskId: task.id,
                data: { assigneeKind: 'human' },
              }),
            disabled: task.assigneeKind === 'human',
          },
          {
            id: 'assignee-jovie',
            label: 'Jovie',
            onClick: () =>
              updateTaskMutation.mutate({
                taskId: task.id,
                data: { assigneeKind: 'jovie' },
              }),
            disabled: task.assigneeKind === 'jovie',
          },
        ],
      },
    ],
    [openReleaseSidebar, openTaskDocument, updateTaskMutation]
  );

  const sidebarPanel = selectedRelease ? (
    <ReleaseSidebar
      release={selectedRelease}
      mode='admin'
      isOpen
      providerConfig={providerConfig}
      artistName={artistName}
      readOnly
      onClose={() => setSelectedReleaseId(null)}
    />
  ) : null;

  useRegisterRightPanel(sidebarPanel);

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
          id: 'title',
          header: 'Task',
          size: 9999,
          cell: info => (
            <TaskTitleCellContent
              task={info.row.original}
              onOpenRelease={openReleaseSidebar}
            />
          ),
          meta: { className: 'px-1 pr-3' },
        }),
        columnHelper.accessor('status', {
          id: 'status',
          header: 'Status',
          size: 116,
          cell: info => <StatusBadgeCell status={info.getValue()} />,
          meta: { className: 'px-1' },
        }),
        columnHelper.accessor('priority', {
          id: 'priority',
          header: 'Priority',
          size: 92,
          cell: info => <PriorityCell priority={info.getValue()} />,
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
        columnHelper.display({
          id: 'actions',
          header: '',
          size: 48,
          enableSorting: false,
          cell: info => (
            <TableActionMenu
              items={convertContextMenuItems(
                getTaskContextMenuItems(info.row.original)
              )}
              trigger='custom'
            >
              <button
                type='button'
                onClick={event => event.stopPropagation()}
                aria-label='Open task actions'
                className='ml-auto inline-flex h-6.5 w-6.5 items-center justify-center rounded-full border border-transparent bg-transparent text-tertiary-token transition-[background-color,border-color,color] duration-150 hover:border-subtle hover:bg-surface-1 hover:text-primary-token focus-visible:border-(--linear-border-focus) focus-visible:bg-surface-1'
              >
                <MoreVertical className='h-3.5 w-3.5' />
              </button>
            </TableActionMenu>
          ),
          meta: { className: 'px-1 pr-3' },
        }),
      ] as ColumnDef<TaskView, unknown>[],
    [getTaskContextMenuItems, openReleaseSidebar, updateTaskMutation]
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
          <div className='flex min-h-0 flex-1'>
            <div
              className={cn(
                'min-h-0 min-w-0',
                selectedTask
                  ? 'w-[min(48vw,560px)] border-r border-subtle'
                  : 'flex-1'
              )}
            >
              <UnifiedTable
                data={tasks}
                columns={columns}
                isLoading={isLoading}
                getRowId={row => row.id}
                enableVirtualization={false}
                rowHeight={60}
                skeletonRows={8}
                className='text-[13px]'
                containerClassName='h-full px-2 pb-2 pt-0.5'
                onRowClick={row => openTaskDocument(row)}
                getContextMenuItems={getTaskContextMenuItems}
                getRowClassName={row =>
                  cn(
                    'rounded-none border-b border-[color-mix(in_oklab,var(--linear-app-frame-seam)_72%,transparent)] transition-colors',
                    row.id === selectedTaskId
                      ? 'bg-[color-mix(in_oklab,var(--linear-row-hover)_92%,transparent)]'
                      : row.status === 'done'
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
            {selectedTask ? (
              <TaskDocumentPanel
                task={selectedTask}
                title={editorTitle}
                description={editorDescription}
                onTitleChange={setEditorTitle}
                onDescriptionChange={setEditorDescription}
                onClose={() => setSelectedTaskId(null)}
                onSave={() => void handleSaveTaskDocument()}
                onOpenRelease={openReleaseSidebar}
                isSaving={updateTaskMutation.isPending}
              />
            ) : (
              <TaskDocumentPanel
                task={null}
                title=''
                description=''
                onTitleChange={() => {}}
                onDescriptionChange={() => {}}
                onClose={() => {}}
                onSave={() => {}}
                onOpenRelease={() => {}}
                isSaving={false}
              />
            )}
          </div>
        )}
      </section>
    </DashboardWorkspacePanel>
  );
}
