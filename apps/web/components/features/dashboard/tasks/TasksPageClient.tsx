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
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  Disc3,
  FileText,
  Flag,
  MoreVertical,
  Plus,
  User,
  X,
} from 'lucide-react';
import {
  type FormEvent,
  type ReactNode,
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
import { TaskListRow } from '@/components/features/dashboard/tasks/TaskListRow';
import {
  HIDDEN_DIV_STYLES,
  useTextareaAutosize,
} from '@/components/jovie/hooks/useTextareaAutosize';
import { AppSearchField } from '@/components/molecules/AppSearchField';
import { TableFilterDropdown } from '@/components/molecules/filters';
import { PageShell } from '@/components/organisms/PageShell';
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
import { getAccentCssVars } from '@/lib/ui/accent-palette';
import { cn } from '@/lib/utils';
import { isFormElement } from '@/lib/utils/keyboard';
import {
  getTaskAssigneeMeta,
  getTaskPriorityFilterIcon,
  getTaskPriorityMeta,
  getTaskStatusFilterIcon,
  getTaskVisualStage,
} from './task-presentation';

const columnHelper = createColumnHelper<TaskView>();

const TASK_STATUS_OPTIONS = [
  ['backlog', 'Backlog'],
  ['todo', 'Todo'],
  ['in_progress', 'In Progress'],
  ['done', 'Done'],
  ['cancelled', 'Cancelled'],
] as const satisfies ReadonlyArray<readonly [TaskStatus, string]>;

const TASK_PRIORITY_OPTIONS = [
  ['urgent', 'Urgent'],
  ['high', 'High'],
  ['medium', 'Medium'],
  ['low', 'Low'],
  ['none', 'None'],
] as const satisfies ReadonlyArray<readonly [TaskPriority, string]>;

const TASK_ASSIGNEE_OPTIONS = [
  ['human', 'You'],
  ['jovie', 'Jovie'],
] as const satisfies ReadonlyArray<readonly [TaskAssigneeKind, string]>;

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

function TaskStageInline({
  task,
  withChevron = false,
}: Readonly<{
  task: TaskView;
  withChevron?: boolean;
}>) {
  const stage = getTaskVisualStage(task.status, task.agentStatus);
  const accent = getAccentCssVars(stage.accent);
  const StageIcon = stage.icon;

  return (
    <span
      className='inline-flex items-center gap-1.5 text-secondary-token'
      title={`Progress ${stage.label}`}
    >
      <StageIcon
        className={cn(
          'h-3.5 w-3.5',
          task.status === 'done' && 'fill-current',
          task.status === 'in_progress' &&
            stage.percent === 50 &&
            'animate-spin [animation-duration:3s]'
        )}
        style={{ color: accent.solid }}
      />
      <span className='font-[560] text-secondary-token'>{stage.label}</span>
      {withChevron ? (
        <ChevronDown className='h-3 w-3 shrink-0 text-tertiary-token' />
      ) : null}
    </span>
  );
}

function TaskPriorityInline({
  priority,
  withChevron = false,
}: Readonly<{
  priority: TaskPriority;
  withChevron?: boolean;
}>) {
  const meta = getTaskPriorityMeta(priority);
  if (!meta) {
    return null;
  }

  const accent = getAccentCssVars(meta.accent);

  return (
    <span
      className='inline-flex items-center gap-1.5 text-secondary-token'
      title={`Priority ${meta.label}`}
    >
      <span
        className='h-1.5 w-1.5 rounded-full'
        style={{ backgroundColor: accent.solid }}
        aria-hidden='true'
      />
      <span className='font-[560] text-secondary-token'>{meta.label}</span>
      {withChevron ? (
        <ChevronDown className='h-3 w-3 shrink-0 text-tertiary-token' />
      ) : null}
    </span>
  );
}

function TaskAssigneeInline({
  assigneeKind,
  artistName,
  withChevron = false,
}: Readonly<{
  assigneeKind: TaskAssigneeKind;
  artistName?: string | null;
  withChevron?: boolean;
}>) {
  const meta = getTaskAssigneeMeta(assigneeKind, artistName);
  const accent = getAccentCssVars(meta.accent);

  return (
    <span
      className='inline-flex items-center gap-2 text-secondary-token'
      title={`Assignee ${meta.label}`}
    >
      <span
        className='inline-flex rounded-full'
        style={{
          boxShadow: `0 0 0 1px color-mix(in oklab, ${accent.solid} 18%, transparent)`,
        }}
      >
        <UserAvatar name={meta.name} size='xs' />
      </span>
      <span className='font-[560] text-secondary-token'>{meta.label}</span>
      {withChevron ? (
        <ChevronDown className='h-3 w-3 shrink-0 text-tertiary-token' />
      ) : null}
    </span>
  );
}

function TaskMetaTrigger({
  children,
  ariaLabel,
}: Readonly<{
  children: ReactNode;
  ariaLabel: string;
}>) {
  return (
    <button
      type='button'
      aria-label={ariaLabel}
      className='-mx-1 inline-flex min-w-0 items-center rounded-md px-1 py-1 text-secondary-token transition-colors hover:bg-surface-1 hover:text-primary-token data-[state=open]:bg-surface-1 data-[state=open]:text-primary-token'
    >
      {children}
    </button>
  );
}

function TaskMetaMenuNumber({
  task,
  onOpenRelease,
  onUpdateStatus,
  onUpdatePriority,
  onUpdateAssignee,
}: Readonly<{
  task: TaskView;
  onOpenRelease: (task: TaskView) => void;
  onUpdateStatus: (status: TaskStatus) => void;
  onUpdatePriority: (priority: TaskPriority) => void;
  onUpdateAssignee: (assigneeKind: TaskAssigneeKind) => void;
}>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <TaskMetaTrigger ariaLabel='Open task controls'>
          <span className='inline-flex items-center gap-1 text-[11px] font-[600] text-tertiary-token'>
            <span className='shrink-0'>J-{task.taskNumber}</span>
            <ChevronDown className='h-3 w-3 shrink-0 text-tertiary-token' />
          </span>
        </TaskMetaTrigger>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='start'
        sideOffset={8}
        className='min-w-[13rem]'
      >
        {task.releaseId ? (
          <DropdownMenuItem onSelect={() => onOpenRelease(task)}>
            <Disc3 className='mr-2 h-4 w-4' />
            Open Release
          </DropdownMenuItem>
        ) : null}
        {TASK_STATUS_OPTIONS.map(([value, label]) => {
          const Icon = getTaskStatusFilterIcon(value);

          return (
            <DropdownMenuItem
              key={value}
              onSelect={() => onUpdateStatus(value)}
              disabled={task.status === value}
            >
              <Icon className='mr-2 h-4 w-4' />
              <span className='flex-1'>{label}</span>
              {task.status === value ? <Check className='h-4 w-4' /> : null}
            </DropdownMenuItem>
          );
        })}
        {TASK_PRIORITY_OPTIONS.map(([value, label]) => {
          const Icon = getTaskPriorityFilterIcon(value);

          return (
            <DropdownMenuItem
              key={value}
              onSelect={() => onUpdatePriority(value)}
              disabled={task.priority === value}
            >
              <Icon className='mr-2 h-4 w-4' />
              <span className='flex-1'>{label}</span>
              {task.priority === value ? <Check className='h-4 w-4' /> : null}
            </DropdownMenuItem>
          );
        })}
        {TASK_ASSIGNEE_OPTIONS.map(([value, label]) => {
          const meta = getTaskAssigneeMeta(value);
          const Icon = meta.filterIcon;

          return (
            <DropdownMenuItem
              key={value}
              onSelect={() => onUpdateAssignee(value)}
              disabled={task.assigneeKind === value}
            >
              <Icon className='mr-2 h-4 w-4' />
              <span className='flex-1'>{label}</span>
              {task.assigneeKind === value ? (
                <Check className='h-4 w-4' />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TaskDocumentPanel({
  task,
  title,
  description,
  onTitleChange,
  onDescriptionChange,
  onClose,
  onOpenRelease,
  onUpdateStatus,
  onUpdatePriority,
  onUpdateAssignee,
  artistName,
  canSelectPrevious,
  canSelectNext,
  onSelectPrevious,
  onSelectNext,
}: Readonly<{
  task: TaskView | null;
  title: string;
  description: string;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onClose: () => void;
  onOpenRelease: (task: TaskView) => void;
  onUpdateStatus: (taskId: string, status: TaskStatus) => void;
  onUpdatePriority: (taskId: string, priority: TaskPriority) => void;
  onUpdateAssignee: (taskId: string, assigneeKind: TaskAssigneeKind) => void;
  artistName?: string | null;
  canSelectPrevious: boolean;
  canSelectNext: boolean;
  onSelectPrevious: () => void;
  onSelectNext: () => void;
}>) {
  if (!task) {
    return (
      <div className='flex min-h-0 flex-1 items-center justify-center px-6 py-6'>
        <div className='max-w-[34rem] px-6 py-10 text-center'>
          <div className='mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-surface-1 text-secondary-token'>
            <FileText className='h-5 w-5' />
          </div>
          <h2 className='mt-5 text-[21px] font-[590] tracking-[-0.03em] text-primary-token'>
            Select a task
          </h2>
        </div>
      </div>
    );
  }

  const hasRelease = Boolean(task.releaseId && task.releaseTitle);

  return (
    <div className='flex min-h-0 min-w-0 flex-1 flex-col px-2 pb-2 pr-2 pt-2'>
      <div className='flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'>
        <div className='flex flex-col gap-3 border-b border-[color-mix(in_oklab,var(--linear-app-frame-seam)_68%,transparent)] px-5 py-3 sm:px-6 xl:flex-row xl:items-center xl:justify-between'>
          <div className='flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-secondary-token'>
            <TaskMetaMenuNumber
              task={task}
              onOpenRelease={onOpenRelease}
              onUpdateStatus={status => onUpdateStatus(task.id, status)}
              onUpdatePriority={priority => onUpdatePriority(task.id, priority)}
              onUpdateAssignee={assigneeKind =>
                onUpdateAssignee(task.id, assigneeKind)
              }
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <TaskMetaTrigger ariaLabel='Change task status'>
                  <TaskStageInline task={task} withChevron />
                </TaskMetaTrigger>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='start' sideOffset={8}>
                {TASK_STATUS_OPTIONS.map(([value, label]) => {
                  const Icon = getTaskStatusFilterIcon(value);

                  return (
                    <DropdownMenuItem
                      key={value}
                      onSelect={() => onUpdateStatus(task.id, value)}
                      disabled={task.status === value}
                    >
                      <Icon className='mr-2 h-4 w-4' />
                      <span className='flex-1'>{label}</span>
                      {task.status === value ? (
                        <Check className='h-4 w-4' />
                      ) : null}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <TaskMetaTrigger ariaLabel='Change task priority'>
                  <TaskPriorityInline priority={task.priority} withChevron />
                </TaskMetaTrigger>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='start' sideOffset={8}>
                {TASK_PRIORITY_OPTIONS.map(([value, label]) => {
                  const Icon = getTaskPriorityFilterIcon(value);

                  return (
                    <DropdownMenuItem
                      key={value}
                      onSelect={() => onUpdatePriority(task.id, value)}
                      disabled={task.priority === value}
                    >
                      <Icon className='mr-2 h-4 w-4' />
                      <span className='flex-1'>{label}</span>
                      {task.priority === value ? (
                        <Check className='h-4 w-4' />
                      ) : null}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <TaskMetaTrigger ariaLabel='Change task assignee'>
                  <TaskAssigneeInline
                    assigneeKind={task.assigneeKind}
                    artistName={artistName}
                    withChevron
                  />
                </TaskMetaTrigger>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='start' sideOffset={8}>
                {TASK_ASSIGNEE_OPTIONS.map(([value, label]) => {
                  const meta = getTaskAssigneeMeta(value, artistName);
                  const Icon = meta.filterIcon;

                  return (
                    <DropdownMenuItem
                      key={value}
                      onSelect={() => onUpdateAssignee(task.id, value)}
                      disabled={task.assigneeKind === value}
                    >
                      <Icon className='mr-2 h-4 w-4' />
                      <span className='flex-1'>{label}</span>
                      {task.assigneeKind === value ? (
                        <Check className='h-4 w-4' />
                      ) : null}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
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
                className='inline-flex min-w-0 items-center gap-1 text-secondary-token transition-colors hover:text-primary-token'
              >
                <Disc3 className='h-3.5 w-3.5 shrink-0 text-tertiary-token' />
                <span className='truncate font-[560]'>{task.releaseTitle}</span>
              </button>
            ) : null}
          </div>
          <div className='flex shrink-0 items-center justify-end gap-1'>
            <div className='hidden items-center gap-0.5 xl:flex'>
              <button
                type='button'
                onClick={onSelectPrevious}
                aria-label='Previous task'
                disabled={!canSelectPrevious}
                className='inline-flex h-7 w-7 items-center justify-center rounded-full text-tertiary-token transition-colors hover:bg-surface-1 hover:text-primary-token disabled:cursor-default disabled:opacity-35'
              >
                <ArrowUp className='h-3.5 w-3.5' />
              </button>
              <button
                type='button'
                onClick={onSelectNext}
                aria-label='Next task'
                disabled={!canSelectNext}
                className='inline-flex h-7 w-7 items-center justify-center rounded-full text-tertiary-token transition-colors hover:bg-surface-1 hover:text-primary-token disabled:cursor-default disabled:opacity-35'
              >
                <ArrowDown className='h-3.5 w-3.5' />
              </button>
            </div>
            <button
              type='button'
              onClick={onClose}
              aria-label='Back to task list'
              className='inline-flex h-8 w-8 items-center justify-center rounded-full text-tertiary-token transition-colors hover:bg-surface-1 hover:text-primary-token xl:hidden'
            >
              <ArrowLeft className='h-4 w-4' />
            </button>
          </div>
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto'>
          <div className='mx-auto flex w-full max-w-[46rem] flex-col gap-4 px-5 py-6 sm:px-8 sm:py-8'>
            <div className='space-y-1'>
              <TaskTitleEditor value={title} onChange={onTitleChange} />
            </div>

            <textarea
              id='task-context-editor'
              value={description}
              onChange={event => onDescriptionChange(event.target.value)}
              placeholder='Start writing...'
              className='min-h-[520px] w-full resize-none border-0 bg-transparent px-0 py-0 text-[15px] leading-[1.95] text-primary-token outline-none placeholder:text-[color-mix(in_oklab,var(--text-tertiary)_82%,transparent)]'
            />
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
  const tasks = useMemo(() => data?.tasks ?? [], [data?.tasks]);
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
  const selectedTaskIndex = selectedTaskId
    ? tasks.findIndex(task => task.id === selectedTaskId)
    : -1;
  const canSelectPrevious = selectedTaskIndex > 0;
  const canSelectNext =
    selectedTaskIndex !== -1 && selectedTaskIndex < tasks.length - 1;

  const taskFilterCategories = useMemo(
    () => [
      {
        id: 'status',
        label: 'Status',
        iconName: 'Hash',
        options: TASK_STATUS_OPTIONS.map(([value, label]) => ({
          id: value,
          label,
          iconName: getTaskStatusFilterIcon(value).name,
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
        iconName: 'AlertTriangle',
        options: TASK_PRIORITY_OPTIONS.map(([value, label]) => ({
          id: value,
          label,
          iconName: getTaskPriorityFilterIcon(value).name,
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
        options: TASK_ASSIGNEE_OPTIONS.map(([value, label]) => ({
          id: value,
          label,
          iconName: getTaskAssigneeMeta(value).filterIcon.name,
        })),
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

  const openReleaseSidebar = useCallback((task: TaskView) => {
    if (task.releaseId) {
      setSelectedReleaseId(task.releaseId);
    }
  }, []);

  const openTaskDocument = useCallback((task: TaskView) => {
    setIsComposerOpen(false);
    setSelectedTaskId(task.id);
  }, []);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (tasks.length === 0) {
      if (selectedTaskId !== null) {
        setSelectedTaskId(null);
      }
      return;
    }

    const hasVisibleSelection = tasks.some(task => task.id === selectedTaskId);
    if (!hasVisibleSelection) {
      setSelectedTaskId(tasks[0]?.id ?? null);
    }
  }, [isLoading, selectedTaskId, tasks]);

  const selectTaskByIndex = useCallback(
    (index: number) => {
      const nextTask = tasks[index];
      if (!nextTask) {
        return;
      }

      openTaskDocument(nextTask);
    },
    [openTaskDocument, tasks]
  );

  const selectPreviousTask = useCallback(() => {
    if (!canSelectPrevious) {
      return;
    }

    selectTaskByIndex(selectedTaskIndex - 1);
  }, [canSelectPrevious, selectTaskByIndex, selectedTaskIndex]);

  const selectNextTask = useCallback(() => {
    if (!canSelectNext) {
      return;
    }

    selectTaskByIndex(selectedTaskIndex + 1);
  }, [canSelectNext, selectTaskByIndex, selectedTaskIndex]);

  useEffect(() => {
    if (!selectedTask || updateTaskMutation.isPending) {
      return;
    }

    const nextTitle = editorTitle.trim();
    const nextDescription = editorDescription.trim();
    const currentDescription = selectedTask.description ?? '';
    const hasChanges =
      nextTitle !== selectedTask.title ||
      nextDescription !== currentDescription;

    if (!hasChanges || !nextTitle) {
      return;
    }

    const timeoutId = globalThis.setTimeout(() => {
      updateTaskMutation.mutate(
        {
          taskId: selectedTask.id,
          data: {
            title: nextTitle,
            description: nextDescription || null,
          },
        },
        {
          onError: () => {
            toast.error("Couldn't update task");
          },
        }
      );
    }, 450);

    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, [
    editorDescription,
    editorTitle,
    selectedTask,
    updateTaskMutation,
    updateTaskMutation.isPending,
  ]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isFormElement(event.target)) return;
      if (!selectedTask) return;

      const key = event.key.toLowerCase();
      if (key === 'j') {
        event.preventDefault();
        selectNextTask();
      } else if (key === 'k') {
        event.preventDefault();
        selectPreviousTask();
      }
    }

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectNextTask, selectPreviousTask, selectedTask]);

  const updateTaskField = useCallback(
    (
      taskId: string,
      data: Partial<Pick<TaskView, 'status' | 'priority' | 'assigneeKind'>>
    ) => {
      updateTaskMutation.mutate({
        taskId,
        data,
      });
    },
    [updateTaskMutation]
  );

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
        items: TASK_STATUS_OPTIONS.map(([value, label]) => ({
          id: `status-${value}`,
          label,
          onClick: () => updateTaskField(task.id, { status: value }),
          disabled: task.status === value,
        })),
      },
      {
        id: 'change-priority',
        label: 'Change Priority',
        icon: <Flag className='h-4 w-4' />,
        items: TASK_PRIORITY_OPTIONS.map(([value, label]) => ({
          id: `priority-${value}`,
          label,
          onClick: () => updateTaskField(task.id, { priority: value }),
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
            onClick: () => updateTaskField(task.id, { assigneeKind: 'human' }),
            disabled: task.assigneeKind === 'human',
          },
          {
            id: 'assignee-jovie',
            label: 'Jovie',
            onClick: () => updateTaskField(task.id, { assigneeKind: 'jovie' }),
            disabled: task.assigneeKind === 'jovie',
          },
        ],
      },
    ],
    [openReleaseSidebar, openTaskDocument, updateTaskField]
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
            <TaskListRow
              task={info.row.original}
              onOpenRelease={openReleaseSidebar}
              artistName={artistName}
              actionSlot={null}
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
                className='ml-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-transparent bg-transparent text-tertiary-token transition-[background-color,color,box-shadow] duration-150 hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:bg-surface-1 focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
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
          'flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] bg-[color-mix(in_oklab,var(--linear-app-content-surface)_98%,transparent)]'
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
            <div className='flex min-w-0 flex-1 items-center gap-2'>
              <AppSearchField
                value={search}
                onChange={setSearch}
                placeholder='Search Tasks'
                ariaLabel='Search tasks'
                className='max-w-[280px] flex-1'
                inputClassName='text-[12px]'
              />
              <TableFilterDropdown
                categories={taskFilterCategories}
                onClearAll={clearFilters}
                iconOnly
              />
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
          <div className='flex min-h-0 flex-1'>
            <div
              className={cn(
                'min-h-0 min-w-0 shrink-0',
                (selectedTask || showTaskWorkbenchEmptyState) &&
                  'xl:w-[28rem] 2xl:w-[30rem] min-[1800px]:w-[32rem] xl:border-r xl:border-[color-mix(in_oklab,var(--linear-app-shell-border)_74%,transparent)]',
                selectedTask ? 'hidden xl:block' : 'flex-1'
              )}
            >
              {showTaskWorkbenchEmptyState ? (
                <div className='flex h-full items-center justify-center px-6 py-6'>
                  <div className='w-full max-w-[26rem] px-6 py-8'>
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
                  rowHeight={64}
                  skeletonRows={8}
                  className='text-[13px]'
                  containerClassName='h-full px-2 pb-2 pt-1'
                  onRowClick={row => openTaskDocument(row)}
                  getContextMenuItems={getTaskContextMenuItems}
                  getRowClassName={row =>
                    cn(
                      'rounded-[12px] border border-transparent transition-[background-color,border-color,box-shadow,opacity]',
                      row.id === selectedTaskId
                        ? 'border-[color-mix(in_oklab,var(--linear-app-frame-seam)_70%,transparent)] bg-[color-mix(in_oklab,var(--linear-row-hover)_78%,var(--linear-app-content-surface))] shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_0_0_1px_color-mix(in_oklab,var(--color-accent-blue)_10%,transparent)]'
                        : row.status === 'done'
                          ? 'opacity-75'
                          : row.status === 'cancelled'
                            ? 'opacity-60'
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
            <div
              className={cn(
                'min-h-0 min-w-0 flex-1',
                selectedTask ? 'flex' : 'hidden xl:flex'
              )}
            >
              {selectedTask ? (
                <TaskDocumentPanel
                  task={selectedTask}
                  title={editorTitle}
                  description={editorDescription}
                  onTitleChange={setEditorTitle}
                  onDescriptionChange={setEditorDescription}
                  onClose={() => setSelectedTaskId(null)}
                  onOpenRelease={openReleaseSidebar}
                  onUpdateStatus={(taskId, status) =>
                    updateTaskField(taskId, { status })
                  }
                  onUpdatePriority={(taskId, priority) =>
                    updateTaskField(taskId, { priority })
                  }
                  onUpdateAssignee={(taskId, assigneeKind) =>
                    updateTaskField(taskId, { assigneeKind })
                  }
                  artistName={artistName}
                  canSelectPrevious={canSelectPrevious}
                  canSelectNext={canSelectNext}
                  onSelectPrevious={selectPreviousTask}
                  onSelectNext={selectNextTask}
                />
              ) : (
                <TaskDocumentPanel
                  task={null}
                  title=''
                  description=''
                  onTitleChange={() => {}}
                  onDescriptionChange={() => {}}
                  onClose={() => {}}
                  onOpenRelease={() => {}}
                  onUpdateStatus={() => {}}
                  onUpdatePriority={() => {}}
                  onUpdateAssignee={() => {}}
                  artistName={artistName}
                  canSelectPrevious={false}
                  canSelectNext={false}
                  onSelectPrevious={() => {}}
                  onSelectNext={() => {}}
                />
              )}
            </div>
          </div>
        )}
      </section>
    </PageShell>
  );
}
