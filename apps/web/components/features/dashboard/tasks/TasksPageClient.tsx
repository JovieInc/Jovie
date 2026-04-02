'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  UserAvatar,
} from '@jovie/ui';
import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import {
  Bot,
  Check,
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
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { providerConfig } from '@/app/app/(shell)/dashboard/releases/config';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import { DashboardHeaderActionButton } from '@/components/features/dashboard/atoms/DashboardHeaderActionButton';
import { ReleaseTaskDueBadge } from '@/components/features/dashboard/release-tasks/ReleaseTaskDueBadge';
import {
  HIDDEN_DIV_STYLES,
  useTextareaAutosize,
} from '@/components/jovie/hooks/useTextareaAutosize';
import { TableFilterDropdown } from '@/components/molecules/filters';
import {
  PAGE_SHELL_SURFACE_CLASSNAMES,
  PageShell,
} from '@/components/organisms/PageShell';
import { ReleaseSidebar } from '@/components/organisms/release-sidebar';
import {
  type ContextMenuItemType,
  convertContextMenuItems,
  PageToolbar,
  UnifiedTable,
} from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
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
  TASK_PRIORITY_ACCENT,
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
    accent: TASK_PRIORITY_ACCENT.urgent,
  },
  high: {
    label: 'High',
    symbol: 'High',
    accent: TASK_PRIORITY_ACCENT.high,
  },
  medium: {
    label: 'Medium',
    symbol: 'Medium',
    accent: TASK_PRIORITY_ACCENT.medium,
  },
  low: { label: 'Low', symbol: 'Low', accent: TASK_PRIORITY_ACCENT.low },
  none: { label: 'None', symbol: '', accent: TASK_PRIORITY_ACCENT.none },
};

const TASK_PROGRESS_META: Record<
  TaskStatus,
  {
    readonly percent: 25 | 50 | 75 | 100;
    readonly accent: AccentPaletteName;
  }
> = {
  backlog: { percent: 25, accent: 'orange' },
  todo: { percent: 50, accent: 'blue' },
  in_progress: { percent: 75, accent: 'purple' },
  done: { percent: 100, accent: 'pink' },
  cancelled: { percent: 25, accent: 'gray' },
};

function ProgressRing({ status }: Readonly<{ status: TaskStatus }>) {
  const { percent, accent } = TASK_PROGRESS_META[status];
  const accentVars = getAccentCssVars(accent);
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - percent / 100);

  return (
    <div
      className='flex h-8 w-8 items-center justify-center rounded-full'
      title={`${STATUS_META[status].label} · ${percent}%`}
    >
      <svg
        viewBox='0 0 24 24'
        className='h-6 w-6 -rotate-90'
        aria-hidden='true'
      >
        <circle
          cx='12'
          cy='12'
          r={radius}
          fill='none'
          stroke='color-mix(in oklab, var(--linear-app-frame-seam) 70%, transparent)'
          strokeWidth='2'
        />
        <circle
          cx='12'
          cy='12'
          r={radius}
          fill='none'
          stroke={accentVars.solid}
          strokeLinecap='round'
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeWidth='2'
        />
      </svg>
    </div>
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

function PriorityCell({
  priority,
  compact = false,
}: Readonly<{ priority: TaskPriority; compact?: boolean }>) {
  const meta = PRIORITY_META[priority];
  const accent = getAccentCssVars(meta.accent);

  if (!meta.symbol) {
    return <span className='text-[11px] text-tertiary-token'>-</span>;
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-[600]',
        compact
          ? 'gap-1.5 px-2 py-0.5 text-[10px]'
          : 'gap-1.5 px-2.5 py-1 text-[10.5px]'
      )}
      style={{
        backgroundColor: `color-mix(in oklab, ${accent.solid} 16%, var(--linear-surface-elevated))`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${accent.solid} 24%, transparent)`,
        color: accent.solid,
      }}
      title={`Priority: ${meta.label}`}
    >
      <span
        className='h-1.5 w-1.5 rounded-full'
        style={{ backgroundColor: accent.solid }}
        aria-hidden='true'
      />
      {meta.symbol}
    </span>
  );
}

function AssigneeCell({
  assigneeKind,
  artistName,
  compact = false,
}: Readonly<{
  assigneeKind: TaskAssigneeKind;
  artistName?: string | null;
  compact?: boolean;
}>) {
  const isJovie = assigneeKind === 'jovie';
  const label = isJovie ? 'Jovie' : 'You';
  const name = isJovie ? 'Jovie' : (artistName ?? 'You');
  const accent = getAccentCssVars(isJovie ? 'pink' : 'blue');

  return (
    <span
      className={cn(
        'inline-flex items-center text-secondary-token',
        compact ? 'gap-1.5 text-[10.5px]' : 'gap-2 text-[11px]'
      )}
      title={`Assignee: ${label}`}
    >
      <span
        className='inline-flex rounded-full'
        style={{
          boxShadow: `0 0 0 1px color-mix(in oklab, ${accent.solid} 22%, transparent)`,
        }}
      >
        <UserAvatar name={name} size='xs' />
      </span>
      <span className='font-[560] text-secondary-token'>{label}</span>
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
  artistName,
}: Readonly<{
  task: TaskView;
  onOpenRelease: (task: TaskView) => void;
  artistName?: string | null;
}>) {
  const hasDueDate = Boolean(task.dueAt);
  const hasRelease = Boolean(task.releaseTitle);

  return (
    <div className='grid min-w-0 grid-cols-[minmax(0,1fr)_9.5rem] items-start gap-3 py-1.5'>
      <div className='flex min-w-0 items-start gap-3'>
        <div className='flex h-[18px] w-8 shrink-0 items-center justify-center'>
          <ProgressRing status={task.status} />
        </div>
        <div className='min-w-0 flex-1'>
          <p className='truncate text-[12.75px] font-[570] leading-[18px] text-primary-token'>
            {task.title}
          </p>
          <div className='mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1'>
            <div className='flex items-center gap-2 text-[10.5px]'>
              <span className='font-[560] text-tertiary-token'>
                J-{task.taskNumber}
              </span>
              <span className='text-tertiary-token/40'>·</span>
              <PriorityCell priority={task.priority} compact />
              {hasRelease ? (
                <>
                  <span className='text-tertiary-token/40'>·</span>
                  <button
                    type='button'
                    onClick={event => {
                      event.stopPropagation();
                      onOpenRelease(task);
                    }}
                    className='truncate text-secondary-token transition-colors hover:text-primary-token'
                  >
                    {task.releaseTitle}
                  </button>
                </>
              ) : null}
            </div>
          </div>
          {task.description ? (
            <p className='mt-1 truncate text-[11px] leading-[15px] text-secondary-token/70'>
              {task.description}
            </p>
          ) : null}
        </div>
      </div>
      <div className='flex w-[9.5rem] flex-col items-end gap-1.5 pt-0.5 text-right'>
        <StatusBadgeCell status={task.status} />
        <div className='min-h-[18px] text-[10.5px]'>
          {hasDueDate ? (
            <ReleaseTaskDueBadge
              dueDate={task.dueAt!}
              dueDaysOffset={null}
              isCompleted={task.status === 'done'}
            />
          ) : (
            <span className='text-tertiary-token'>No due date</span>
          )}
        </div>
        <div className='flex min-h-[18px] items-center'>
          <AssigneeCell
            assigneeKind={task.assigneeKind}
            artistName={artistName}
            compact
          />
        </div>
      </div>
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
  artistName,
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
  artistName?: string | null;
}>) {
  if (!task) {
    return (
      <div className='flex min-h-0 flex-1 items-center justify-center bg-surface-0 px-6 py-6'>
        <div
          className={cn(
            PAGE_SHELL_SURFACE_CLASSNAMES.emptyState,
            'max-w-xl px-8 py-10 text-center'
          )}
        >
          <div className='mx-auto flex h-11 w-11 items-center justify-center rounded-[14px] border border-subtle bg-surface-1 text-secondary-token'>
            <FileText className='h-5 w-5' />
          </div>
          <p className='mt-4 text-[10.5px] font-[700] uppercase tracking-[0.16em] text-tertiary-token'>
            Task Workspace
          </p>
          <h2 className='mt-2 text-[21px] font-[590] tracking-[-0.03em] text-primary-token'>
            Select a task to open it
          </h2>
          <p className='mt-2 text-[13px] leading-[20px] text-secondary-token'>
            The brief, deliverables, and agent context stay in one working
            document instead of getting buried in a table row.
          </p>
        </div>
      </div>
    );
  }

  const hasRelease = Boolean(task.releaseId && task.releaseTitle);

  return (
    <div className='flex min-h-0 min-w-0 flex-1 flex-col bg-surface-0'>
      <div className='flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'>
        <div className='flex flex-col gap-4 border-b border-[color-mix(in_oklab,var(--linear-app-frame-seam)_72%,transparent)] px-6 py-4 xl:flex-row xl:items-start xl:justify-between'>
          <div className='flex min-w-0 flex-1 flex-col gap-3'>
            <div className='flex min-w-0 flex-wrap items-center gap-2'>
              <span
                className={cn(
                  PAGE_SHELL_SURFACE_CLASSNAMES.metaRow,
                  'px-2.5 py-1 text-[10px] font-[650] uppercase tracking-[0.1em] text-tertiary-token'
                )}
              >
                Task J-{task.taskNumber}
              </span>
              <StatusBadgeCell status={task.status} />
              <PriorityCell priority={task.priority} />
              <AssigneeCell
                assigneeKind={task.assigneeKind}
                artistName={artistName}
              />
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
                  className={cn(
                    PAGE_SHELL_SURFACE_CLASSNAMES.metaRow,
                    'truncate px-2.5 py-1 text-[10.5px] font-[600] text-secondary-token transition-colors hover:text-primary-token'
                  )}
                >
                  {task.releaseTitle}
                </button>
              ) : null}
            </div>
          </div>
          <div className='flex shrink-0 flex-wrap items-center justify-end gap-2'>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={onClose}
            >
              <X className='mr-1 h-3.5 w-3.5' />
              Close
            </Button>
          </div>
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto'>
          <div className='mx-auto flex w-full max-w-[52rem] flex-col gap-8 px-6 py-6 sm:px-8 sm:py-8'>
            <div className='space-y-3'>
              <TaskTitleEditor value={title} onChange={onTitleChange} />
              <p className='max-w-[42rem] text-[14px] leading-[22px] text-secondary-token'>
                Write the assignment so a teammate or agent can pick it up
                cleanly, without a second explanation.
              </p>
            </div>

            <div className='space-y-6'>
              <div
                className={cn(
                  PAGE_SHELL_SURFACE_CLASSNAMES.workspace,
                  'px-6 py-5'
                )}
              >
                <label
                  htmlFor='task-context-editor'
                  className='text-[10.5px] font-[650] uppercase tracking-[0.14em] text-tertiary-token'
                >
                  Task Context
                </label>
                <p className='mt-1 text-[12.5px] leading-[18px] text-secondary-token'>
                  Capture the brief, constraints, rollout notes, links, and
                  deliverables in a document that can survive handoff.
                </p>
                <textarea
                  id='task-context-editor'
                  value={description}
                  onChange={event => onDescriptionChange(event.target.value)}
                  placeholder='Write the brief, constraints, notes, deliverables, and any context an assignee or agent should keep in mind.'
                  className='mt-5 min-h-[320px] w-full resize-none border-0 bg-transparent px-0 text-[15px] leading-[1.85] text-primary-token outline-none placeholder:text-[color-mix(in_oklab,var(--text-tertiary)_82%,transparent)]'
                />
              </div>

              <div className='space-y-4'>
                <div
                  className={cn(
                    PAGE_SHELL_SURFACE_CLASSNAMES.inspector,
                    'px-4 py-4'
                  )}
                >
                  <div className='flex items-center gap-2 text-[10.5px] font-[650] uppercase tracking-[0.14em] text-tertiary-token'>
                    <Bot className='h-3.5 w-3.5' />
                    Agent Context
                  </div>
                  <p className='mt-2 text-[12.5px] leading-[19px] text-secondary-token'>
                    Use this task like a durable operating brief: include
                    references, edge cases, rollout notes, and exact output
                    requirements.
                  </p>
                </div>
                <div
                  className={cn(
                    PAGE_SHELL_SURFACE_CLASSNAMES.inspector,
                    'px-4 py-4'
                  )}
                >
                  <p className='text-[10.5px] font-[650] uppercase tracking-[0.14em] text-tertiary-token'>
                    Editing Notes
                  </p>
                  <ul className='mt-2 space-y-2 text-[12.5px] leading-[18px] text-secondary-token'>
                    <li>Lead with the decision that matters most.</li>
                    <li>Call out dependencies before deliverables.</li>
                    <li>Make agent expectations explicit.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskTitleEditor({
  value,
  onChange,
}: Readonly<{
  value: string;
  onChange: (value: string) => void;
}>) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { measuredHeight, isAtMaxHeight, containerRef, hiddenDivRef } =
    useTextareaAutosize({
      value,
      minHeight: 54,
      maxHeight: 220,
      textareaRef,
    });

  return (
    <div ref={containerRef} className='relative min-w-0'>
      <textarea
        ref={textareaRef}
        value={value}
        rows={1}
        aria-label='Task title'
        onChange={event => onChange(event.target.value)}
        placeholder='Untitled Task'
        className='w-full resize-none border-0 bg-transparent px-0 py-0 text-[clamp(1.85rem,3vw,2.75rem)] font-[620] leading-[1.04] tracking-[-0.045em] text-primary-token outline-none placeholder:text-[color-mix(in_oklab,var(--text-tertiary)_80%,transparent)]'
        style={{
          height: measuredHeight,
          overflowY: isAtMaxHeight ? 'auto' : 'hidden',
        }}
      />
      <div
        ref={hiddenDivRef}
        aria-hidden='true'
        style={{
          ...HIDDEN_DIV_STYLES,
          fontSize: 'clamp(1.85rem, 3vw, 2.75rem)',
          lineHeight: '1.04',
          fontWeight: 620,
          letterSpacing: '-0.045em',
          padding: '0',
        }}
      />
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
    <div className='flex min-h-[360px] flex-col items-center justify-center gap-3 px-6 text-center'>
      <div className='space-y-1'>
        <p className='text-[10.5px] font-[700] uppercase tracking-[0.14em] text-tertiary-token'>
          Task Workspace
        </p>
        <h2 className='text-[18px] font-[580] tracking-[-0.025em] text-primary-token'>
          {hasFilters
            ? 'No tasks match your filters'
            : 'Your task list is empty'}
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
  const [isToolbarMenuOpen, setIsToolbarMenuOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(
    null
  );
  const [editorTitle, setEditorTitle] = useState('');
  const [editorDescription, setEditorDescription] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const deferredSearch = useDeferredValue(search);
  const profileId = selectedProfile?.id;
  const createTaskMutation = useCreateTaskMutation();
  const updateTaskMutation = useUpdateTaskMutation();
  const { data: releases = [] } = useReleasesQuery(profileId ?? '');
  const { setHeaderActions } = useSetHeaderActions();

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
  const clearFilters = useCallback(() => {
    setSearch('');
    setStatusFilter('all');
    setPriorityFilter('all');
    setAssigneeFilter('all');
  }, []);
  const showTaskWorkbenchEmptyState = !isLoading && tasks.length === 0;

  const taskFilterCategories = useMemo(
    () => [
      {
        id: 'status',
        label: 'Status',
        iconName: 'ListTodo',
        options: (
          Object.entries(STATUS_META) as Array<
            [TaskStatus, (typeof STATUS_META)[TaskStatus]]
          >
        ).map(([value, meta]) => ({
          id: value,
          label: meta.label,
        })),
        selectedIds: statusFilter === 'all' ? [] : [statusFilter],
        onToggle: (value: string) =>
          setStatusFilter(current =>
            current === value ? 'all' : (value as TaskStatus)
          ),
        searchPlaceholder: 'Search statuses...',
      },
      {
        id: 'priority',
        label: 'Priority',
        iconName: 'Flag',
        options: (
          Object.entries(PRIORITY_META) as Array<
            [TaskPriority, (typeof PRIORITY_META)[TaskPriority]]
          >
        ).map(([value, meta]) => ({
          id: value,
          label: meta.label,
        })),
        selectedIds: priorityFilter === 'all' ? [] : [priorityFilter],
        onToggle: (value: string) =>
          setPriorityFilter(current =>
            current === value ? 'all' : (value as TaskPriority)
          ),
        searchPlaceholder: 'Search priorities...',
      },
      {
        id: 'assignee',
        label: 'Assignee',
        iconName: 'Users',
        options: [
          { id: 'human', label: 'You' },
          { id: 'jovie', label: 'Jovie' },
        ],
        selectedIds: assigneeFilter === 'all' ? [] : [assigneeFilter],
        onToggle: (value: string) =>
          setAssigneeFilter(current =>
            current === value ? 'all' : (value as TaskAssigneeKind)
          ),
        searchPlaceholder: 'Search assignees...',
      },
    ],
    [assigneeFilter, priorityFilter, statusFilter]
  );

  useEffect(() => {
    if (!selectedTask) {
      setEditorTitle('');
      setEditorDescription('');
      return;
    }

    setEditorTitle(selectedTask.title);
    setEditorDescription(selectedTask.description ?? '');
  }, [selectedTask]);

  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchOpen]);

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
        columnHelper.accessor('taskNumber', {
          id: 'title',
          header: 'Tasks',
          size: 9999,
          cell: info => (
            <TaskTitleCellContent
              task={info.row.original}
              onOpenRelease={openReleaseSidebar}
              artistName={artistName}
            />
          ),
          meta: { className: 'pl-2 pr-2' },
        }),
        columnHelper.display({
          id: 'actions',
          header: '',
          size: 40,
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
                className='ml-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-transparent bg-transparent text-tertiary-token transition-[background-color,border-color,color] duration-150 hover:border-subtle hover:bg-surface-1 hover:text-primary-token focus-visible:border-(--linear-border-focus) focus-visible:bg-surface-1'
              >
                <MoreVertical className='h-3.5 w-3.5' />
              </button>
            </TableActionMenu>
          ),
          meta: { className: 'pl-0 pr-2' },
        }),
      ] as ColumnDef<TaskView, unknown>[],
    [artistName, getTaskContextMenuItems, openReleaseSidebar]
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

  const headerActions = useMemo(
    () => (
      <DropdownMenu
        open={isToolbarMenuOpen}
        onOpenChange={setIsToolbarMenuOpen}
      >
        <DropdownMenuTrigger asChild>
          <div>
            <DashboardHeaderActionButton
              ariaLabel='Open task actions'
              icon={<Plus className='h-3.5 w-3.5' />}
              iconOnly
              pressed={isToolbarMenuOpen || isComposerOpen}
            />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' sideOffset={8}>
          <DropdownMenuItem
            onSelect={() => {
              setIsComposerOpen(true);
            }}
          >
            <Plus className='mr-2 h-4 w-4' />
            New Task
          </DropdownMenuItem>
          {hasFilters ? (
            <DropdownMenuItem
              onSelect={() => {
                setSearch('');
                setStatusFilter('all');
                setPriorityFilter('all');
                setAssigneeFilter('all');
              }}
            >
              <X className='mr-2 h-4 w-4' />
              Clear Filters
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [hasFilters, isComposerOpen, isToolbarMenuOpen]
  );

  useEffect(() => {
    setHeaderActions(headerActions);

    return () => {
      setHeaderActions(null);
    };
  }, [headerActions, setHeaderActions]);

  return (
    <PageShell className='overflow-hidden' data-testid='tasks-workspace'>
      <section
        className={cn(
          PAGE_SHELL_SURFACE_CLASSNAMES.workspace,
          'flex min-h-0 flex-1 flex-col overflow-hidden p-2'
        )}
        data-testid='tasks-content-panel'
      >
        {isComposerOpen ? (
          <form
            onSubmit={handleCreateTask}
            className='flex items-center gap-2 border-b border-[color-mix(in_oklab,var(--linear-app-shell-border)_72%,transparent)] px-app-header py-3'
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
            <div className='flex min-w-0 flex-1 items-center justify-between gap-2'>
              <div className='flex items-center gap-2'>
                {isSearchOpen ? (
                  <div className='relative flex items-center'>
                    <Search className='pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tertiary-token' />
                    <Input
                      ref={searchInputRef}
                      value={search}
                      onChange={event => setSearch(event.target.value)}
                      placeholder='Search Tasks'
                      className='h-8 w-[240px] pl-8 text-[12px]'
                      onBlur={() => {
                        if (!search.trim()) {
                          setIsSearchOpen(false);
                        }
                      }}
                      onKeyDown={event => {
                        if (event.key === 'Escape') {
                          setIsSearchOpen(false);
                          setSearch('');
                        }
                      }}
                    />
                  </div>
                ) : (
                  <button
                    type='button'
                    onClick={() => setIsSearchOpen(true)}
                    className='inline-flex h-8 w-8 items-center justify-center rounded-md text-tertiary-token transition-colors hover:bg-surface-1 hover:text-primary-token'
                    aria-label='Search tasks'
                  >
                    <Search className='h-4 w-4' />
                  </button>
                )}
              </div>
              <div className='flex items-center gap-2'>
                <TableFilterDropdown
                  categories={taskFilterCategories}
                  onClearAll={clearFilters}
                  iconOnly
                />
              </div>
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
          <div className='flex min-h-0 flex-1 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--linear-app-content-surface)_38%,transparent),transparent_20%)]'>
            <div
              className={cn(
                'min-h-0 min-w-0 shrink-0 overflow-x-hidden bg-[color-mix(in_oklab,var(--linear-app-content-surface)_54%,transparent)]',
                selectedTask || showTaskWorkbenchEmptyState
                  ? 'w-[clamp(18rem,32vw,30rem)] border-r border-[color-mix(in_oklab,var(--linear-app-shell-border)_74%,transparent)]'
                  : 'flex-1'
              )}
            >
              {showTaskWorkbenchEmptyState ? (
                <div className='flex h-full items-center justify-center px-6 py-6'>
                  <div
                    className={cn(
                      PAGE_SHELL_SURFACE_CLASSNAMES.emptyState,
                      'w-full max-w-[26rem] px-6 py-8'
                    )}
                  >
                    <TaskEmptyState
                      hasFilters={hasFilters}
                      onClearFilters={clearFilters}
                      onOpenComposer={() => setIsComposerOpen(true)}
                    />
                  </div>
                </div>
              ) : (
                <UnifiedTable
                  data={tasks}
                  columns={columns}
                  isLoading={isLoading}
                  getRowId={row => row.id}
                  hideHeader
                  enableVirtualization={false}
                  rowHeight={68}
                  skeletonRows={8}
                  className='text-[13px]'
                  containerClassName='h-full px-2.5 pb-2.5 pt-1.5'
                  onRowClick={row => openTaskDocument(row)}
                  getContextMenuItems={getTaskContextMenuItems}
                  getRowClassName={row =>
                    cn(
                      'rounded-[14px] border border-transparent transition-colors',
                      row.id === selectedTaskId
                        ? 'border-[color-mix(in_oklab,var(--linear-app-frame-seam)_70%,transparent)] bg-[color-mix(in_oklab,var(--linear-row-hover)_86%,var(--linear-app-content-surface))] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]'
                        : row.status === 'done'
                          ? 'opacity-72'
                          : 'hover:bg-[color-mix(in_oklab,var(--linear-row-hover)_72%,transparent)]'
                    )
                  }
                  emptyState={
                    <TaskEmptyState
                      hasFilters={hasFilters}
                      onClearFilters={clearFilters}
                      onOpenComposer={() => setIsComposerOpen(true)}
                    />
                  }
                />
              )}
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
                artistName={artistName}
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
                artistName={artistName}
              />
            )}
          </div>
        )}
      </section>
    </PageShell>
  );
}
