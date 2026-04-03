'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  UserAvatar,
} from '@jovie/ui';
import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import {
  ArrowLeft,
  ChevronDown,
  Disc3,
  FileText,
  MoreVertical,
  Plus,
} from 'lucide-react';
import {
  type ComponentPropsWithoutRef,
  type FormEvent,
  forwardRef,
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
import { DashboardHeaderActionGroup } from '@/components/features/dashboard/atoms/DashboardHeaderActionGroup';
import { ReleaseTaskDueBadge } from '@/components/features/dashboard/release-tasks/ReleaseTaskDueBadge';
import { TaskListRow } from '@/components/features/dashboard/tasks/TaskListRow';
import {
  HIDDEN_DIV_STYLES,
  useTextareaAutosize,
} from '@/components/jovie/hooks/useTextareaAutosize';
import {
  TOOLBAR_MENU_CONTENT_CLASS,
  TOOLBAR_MENU_SEPARATOR_CLASS,
  ToolbarMenuChoiceItem,
} from '@/components/molecules/menus/ToolbarMenuPrimitives';
import { PageShell } from '@/components/organisms/PageShell';
import { ReleaseSidebar } from '@/components/organisms/release-sidebar';
import {
  type ContextMenuItemType,
  convertContextMenuItems,
  UnifiedTable,
} from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
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
import { TaskWorkspaceHeaderBar } from './TaskWorkspaceHeaderBar';
import {
  getTaskAssigneeVisual,
  getTaskPriorityVisual,
  getTaskStageVisual,
  getTaskStatusVisual,
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

const NOOP = () => {};
const NOOP_TASK_OPEN = (_task: TaskView) => {};
const NOOP_TASK_STATUS_UPDATE = (_taskId: string, _status: TaskStatus) => {};
const NOOP_TASK_PRIORITY_UPDATE = (
  _taskId: string,
  _priority: TaskPriority
) => {};
const NOOP_TASK_ASSIGNEE_UPDATE = (
  _taskId: string,
  _assigneeKind: TaskAssigneeKind
) => {};

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
  const stage = getTaskStageVisual(task.status, task.agentStatus);
  const accent = getAccentCssVars(stage.accent);
  const StageIcon = stage.icon;

  return (
    <span
      className='inline-flex items-center gap-1.5 text-secondary-token'
      title={`Progress ${stage.label}`}
    >
      <StageIcon
        className={cn('h-3.5 w-3.5', task.status === 'done' && 'fill-current')}
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
  const visual = getTaskPriorityVisual(priority);
  const accent = getAccentCssVars(visual.accent);

  return (
    <span
      className='inline-flex items-center gap-1.5 text-secondary-token'
      title={`Priority ${visual.label}`}
    >
      <span
        className='h-1.5 w-1.5 rounded-full'
        style={{ backgroundColor: accent.solid }}
        aria-hidden='true'
      />
      <span className='font-[560] text-secondary-token'>{visual.label}</span>
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
  const meta = getTaskAssigneeVisual(assigneeKind, artistName);
  const accent = getAccentCssVars(meta.accent);

  return (
    <span
      className='inline-flex items-center gap-2 text-secondary-token'
      title={`Assignee ${meta.label}`}
    >
      <span
        aria-hidden='true'
        className='inline-flex rounded-full'
        style={{
          boxShadow: `0 0 0 1px color-mix(in oklab, ${accent.solid} 18%, transparent)`,
        }}
      >
        <UserAvatar name={meta.avatarName} size='xs' />
      </span>
      <span className='font-[560] text-secondary-token'>{meta.label}</span>
      {withChevron ? (
        <ChevronDown className='h-3 w-3 shrink-0 text-tertiary-token' />
      ) : null}
    </span>
  );
}

function TaskStatusLeadingVisual({
  status,
}: Readonly<{
  status: TaskStatus;
}>) {
  const visual = getTaskStatusVisual(status);
  const accent = getAccentCssVars(visual.accent);
  const StatusIcon = visual.icon;

  return (
    <StatusIcon
      className={cn('h-4 w-4', visual.filled && 'fill-current')}
      style={{ color: accent.solid }}
    />
  );
}

function TaskPriorityLeadingVisual({
  priority,
}: Readonly<{
  priority: TaskPriority;
}>) {
  const visual = getTaskPriorityVisual(priority);
  const accent = getAccentCssVars(visual.accent);

  return (
    <span
      className='inline-flex h-4 w-4 items-center justify-center'
      aria-hidden='true'
    >
      <span
        className='h-1.5 w-1.5 rounded-full'
        style={{ backgroundColor: accent.solid }}
      />
    </span>
  );
}

function TaskAssigneeLeadingVisual({
  assigneeKind,
  artistName,
}: Readonly<{
  assigneeKind: TaskAssigneeKind;
  artistName?: string | null;
}>) {
  const meta = getTaskAssigneeVisual(assigneeKind, artistName);

  return <UserAvatar name={meta.avatarName} size='xs' />;
}

const TaskMetaTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<'button'> & {
    ariaLabel: string;
  }
>(function TaskMetaTrigger({ children, ariaLabel, className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type='button'
      aria-label={ariaLabel}
      className={cn(
        '-mx-1 inline-flex min-w-0 items-center rounded-md px-1 py-1 text-secondary-token transition-colors hover:bg-surface-1 hover:text-primary-token data-[state=open]:bg-surface-1 data-[state=open]:text-primary-token',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
});

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
        className={TOOLBAR_MENU_CONTENT_CLASS}
      >
        {task.releaseId ? (
          <ToolbarMenuChoiceItem
            active={false}
            leadingVisual={<Disc3 className='h-4 w-4' />}
            label='Open Release'
            onSelect={() => onOpenRelease(task)}
          />
        ) : null}
        {task.releaseId ? (
          <DropdownMenuSeparator className={TOOLBAR_MENU_SEPARATOR_CLASS} />
        ) : null}
        {TASK_STATUS_OPTIONS.map(([value, label]) => {
          return (
            <ToolbarMenuChoiceItem
              key={value}
              active={task.status === value}
              leadingVisual={<TaskStatusLeadingVisual status={value} />}
              label={label}
              onSelect={() => onUpdateStatus(value)}
              disabled={task.status === value}
            />
          );
        })}
        <DropdownMenuSeparator className={TOOLBAR_MENU_SEPARATOR_CLASS} />
        {TASK_PRIORITY_OPTIONS.map(([value, label]) => {
          return (
            <ToolbarMenuChoiceItem
              key={value}
              active={task.priority === value}
              leadingVisual={<TaskPriorityLeadingVisual priority={value} />}
              label={label}
              onSelect={() => onUpdatePriority(value)}
              disabled={task.priority === value}
            />
          );
        })}
        <DropdownMenuSeparator className={TOOLBAR_MENU_SEPARATOR_CLASS} />
        {TASK_ASSIGNEE_OPTIONS.map(([value, label]) => {
          return (
            <ToolbarMenuChoiceItem
              key={value}
              active={task.assigneeKind === value}
              leadingVisual={
                <span aria-hidden='true'>
                  <TaskAssigneeLeadingVisual assigneeKind={value} />
                </span>
              }
              label={label}
              onSelect={() => onUpdateAssignee(value)}
              disabled={task.assigneeKind === value}
            />
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
  isDesktopLayout,
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
  isDesktopLayout: boolean;
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
        <div className='min-h-0 flex-1 overflow-y-auto'>
          <div className='mx-auto flex w-full max-w-[40rem] flex-col gap-3 px-4 pb-5 pt-4 sm:px-5 sm:pb-6 sm:pt-5'>
            <TaskTitleEditor value={title} onChange={onTitleChange} />

            <div className='flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[color-mix(in_oklab,var(--linear-app-frame-seam)_68%,transparent)] pb-3 text-[11px] text-secondary-token'>
              <TaskMetaMenuNumber
                task={task}
                onOpenRelease={onOpenRelease}
                onUpdateStatus={status => onUpdateStatus(task.id, status)}
                onUpdatePriority={priority =>
                  onUpdatePriority(task.id, priority)
                }
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
                <DropdownMenuContent
                  align='start'
                  sideOffset={8}
                  className={TOOLBAR_MENU_CONTENT_CLASS}
                >
                  {TASK_STATUS_OPTIONS.map(([value, label]) => {
                    return (
                      <ToolbarMenuChoiceItem
                        key={value}
                        active={task.status === value}
                        leadingVisual={
                          <TaskStatusLeadingVisual status={value} />
                        }
                        label={label}
                        onSelect={() => onUpdateStatus(task.id, value)}
                        disabled={task.status === value}
                      />
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
                <DropdownMenuContent
                  align='start'
                  sideOffset={8}
                  className={TOOLBAR_MENU_CONTENT_CLASS}
                >
                  {TASK_PRIORITY_OPTIONS.map(([value, label]) => {
                    return (
                      <ToolbarMenuChoiceItem
                        key={value}
                        active={task.priority === value}
                        leadingVisual={
                          <TaskPriorityLeadingVisual priority={value} />
                        }
                        label={label}
                        onSelect={() => onUpdatePriority(task.id, value)}
                        disabled={task.priority === value}
                      />
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
                <DropdownMenuContent
                  align='start'
                  sideOffset={8}
                  className={TOOLBAR_MENU_CONTENT_CLASS}
                >
                  {TASK_ASSIGNEE_OPTIONS.map(([value, label]) => {
                    return (
                      <ToolbarMenuChoiceItem
                        key={value}
                        active={task.assigneeKind === value}
                        leadingVisual={
                          <span aria-hidden='true'>
                            <TaskAssigneeLeadingVisual
                              assigneeKind={value}
                              artistName={artistName}
                            />
                          </span>
                        }
                        label={label}
                        onSelect={() => onUpdateAssignee(task.id, value)}
                        disabled={task.assigneeKind === value}
                      />
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
                  <span className='truncate font-[560]'>
                    {task.releaseTitle}
                  </span>
                </button>
              ) : null}
              {isDesktopLayout ? null : (
                <button
                  type='button'
                  onClick={onClose}
                  aria-label='Back to task list'
                  className='inline-flex h-8 w-8 items-center justify-center rounded-full text-tertiary-token transition-colors hover:bg-surface-1 hover:text-primary-token'
                >
                  <ArrowLeft className='h-4 w-4' />
                </button>
              )}
            </div>

            <textarea
              id='task-context-editor'
              value={description}
              onChange={event => onDescriptionChange(event.target.value)}
              placeholder='Start writing...'
              className='min-h-[520px] w-full resize-none border-0 bg-transparent px-0 py-0 text-[15px] leading-[1.8] text-primary-token outline-none placeholder:text-[color-mix(in_oklab,var(--text-tertiary)_82%,transparent)]'
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
        className='w-full resize-none border-0 bg-transparent px-0 py-0 text-[clamp(1.7rem,2.6vw,2.45rem)] font-[620] leading-[1.06] tracking-[-0.04em] text-primary-token outline-none placeholder:text-[color-mix(in_oklab,var(--text-tertiary)_80%,transparent)]'
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
          fontSize: 'clamp(1.7rem, 2.6vw, 2.45rem)',
          lineHeight: '1.06',
          fontWeight: 620,
          letterSpacing: '-0.04em',
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
  const { setHeaderActions } = useSetHeaderActions();
  const isXlUp = useBreakpoint('xl');
  const is2xlUp = useBreakpoint('2xl');
  const [headerMode, setHeaderMode] = useState<'default' | 'search' | 'create'>(
    'default'
  );
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>(
    'all'
  );
  const [assigneeFilter, setAssigneeFilter] = useState<
    TaskAssigneeKind | 'all'
  >('all');
  const [draftTitle, setDraftTitle] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(
    null
  );
  const [editorTitle, setEditorTitle] = useState('');
  const [editorDescription, setEditorDescription] = useState('');
  const latestSelectedTaskIdRef = useRef<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const profileId = selectedProfile?.id;
  const createTaskMutation = useCreateTaskMutation();
  const updateTaskMutation = useUpdateTaskMutation();
  const { mutate: updateTask, isPending: isUpdatingTask } = updateTaskMutation;
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
  const tasks = useMemo(() => data?.tasks ?? [], [data?.tasks]);
  const effectiveSelectedTaskId =
    selectedTaskId ?? (isXlUp ? (tasks[0]?.id ?? null) : null);
  const { data: selectedTaskData } = useTaskQuery(
    effectiveSelectedTaskId,
    profileId
  );
  const selectedTask =
    selectedTaskData ??
    tasks.find(task => task.id === effectiveSelectedTaskId) ??
    null;
  const selectedRelease =
    releases.find(release => release.id === selectedReleaseId) ?? null;
  const shouldPrioritizeRightPanel = Boolean(selectedRelease) && !is2xlUp;
  const artistName = resolveArtistName(selectedProfile);
  const hasFilters =
    Boolean(deferredSearch.trim()) ||
    statusFilter !== 'all' ||
    priorityFilter !== 'all' ||
    assigneeFilter !== 'all';
  const showTaskListPane =
    isXlUp || !selectedTask || shouldPrioritizeRightPanel;
  const showTaskDocumentPane =
    (isXlUp || Boolean(selectedTask)) && !shouldPrioritizeRightPanel;
  const clearFilters = useCallback(() => {
    setSearch('');
    setStatusFilter('all');
    setPriorityFilter('all');
    setAssigneeFilter('all');
  }, []);
  const showTaskWorkbenchEmptyState = !isLoading && tasks.length === 0;
  const selectedTaskIndex = effectiveSelectedTaskId
    ? tasks.findIndex(task => task.id === effectiveSelectedTaskId)
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
          leadingVisual: <TaskStatusLeadingVisual status={value} />,
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
          leadingVisual: <TaskPriorityLeadingVisual priority={value} />,
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
          leadingVisual: (
            <TaskAssigneeLeadingVisual
              assigneeKind={value}
              artistName={artistName}
            />
          ),
        })),
        selectedIds: assigneeFilter === 'all' ? [] : [assigneeFilter],
        onToggle: (value: string) =>
          setAssigneeFilter(current =>
            current === value ? 'all' : (value as TaskAssigneeKind)
          ),
        searchPlaceholder: 'Search assignees...',
      },
    ],
    [artistName, assigneeFilter, priorityFilter, statusFilter]
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

  const openTaskDocument = useCallback(
    (task: TaskView) => {
      setHeaderMode(current => (current === 'create' ? 'default' : current));
      if (!is2xlUp) {
        setSelectedReleaseId(null);
      }
      setSelectedTaskId(task.id);
    },
    [is2xlUp]
  );

  useEffect(() => {
    if (!selectedReleaseId || is2xlUp) {
      return;
    }

    setHeaderMode(current => (current === 'create' ? 'default' : current));
  }, [is2xlUp, selectedReleaseId]);

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
      if (!isXlUp && selectedTaskId === null) {
        return;
      }

      setSelectedTaskId(tasks[0]?.id ?? null);
    }
  }, [isLoading, isXlUp, selectedTaskId, tasks]);

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
    latestSelectedTaskIdRef.current = selectedTask?.id ?? null;
  }, [selectedTask]);

  useEffect(() => {
    if (!selectedTask || isUpdatingTask) {
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

    const selectedTaskIdAtSchedule = selectedTask.id;

    const timeoutId = globalThis.setTimeout(() => {
      if (selectedTaskIdAtSchedule !== latestSelectedTaskIdRef.current) {
        return;
      }

      updateTask(
        {
          taskId: selectedTaskIdAtSchedule,
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
    isUpdatingTask,
    selectedTask,
    updateTask,
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
      updateTask(
        {
          taskId,
          data,
        },
        {
          onError: () => {
            toast.error("Couldn't update task");
          },
        }
      );
    },
    [updateTask]
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
              icon: <Disc3 className='h-4 w-4' />,
              onClick: () => openReleaseSidebar(task),
            } satisfies ContextMenuItemType,
            { type: 'separator' } satisfies ContextMenuItemType,
          ]
        : []),
      {
        id: 'change-status',
        label: 'Change Status',
        icon: (() => {
          const StageIcon = getTaskStageVisual(
            task.status,
            task.agentStatus
          ).icon;
          return (
            <StageIcon
              className={cn(
                'h-4 w-4',
                task.status === 'done' && 'fill-current'
              )}
            />
          );
        })(),
        items: TASK_STATUS_OPTIONS.map(([value, label]) => ({
          id: `status-${value}`,
          label,
          icon: <TaskStatusLeadingVisual status={value} />,
          onClick: () => updateTaskField(task.id, { status: value }),
          disabled: task.status === value,
        })),
      },
      {
        id: 'change-priority',
        label: 'Change Priority',
        icon: <TaskPriorityLeadingVisual priority={task.priority} />,
        items: TASK_PRIORITY_OPTIONS.map(([value, label]) => ({
          id: `priority-${value}`,
          label,
          icon: <TaskPriorityLeadingVisual priority={value} />,
          onClick: () => updateTaskField(task.id, { priority: value }),
          disabled: task.priority === value,
        })),
      },
      {
        id: 'change-assignee',
        label: 'Change Assignee',
        icon: (
          <span aria-hidden='true'>
            <TaskAssigneeLeadingVisual
              assigneeKind={task.assigneeKind}
              artistName={artistName}
            />
          </span>
        ),
        items: [
          {
            id: 'assignee-human',
            label: 'You',
            icon: (
              <span aria-hidden='true'>
                <TaskAssigneeLeadingVisual
                  assigneeKind='human'
                  artistName={artistName}
                />
              </span>
            ),
            onClick: () => updateTaskField(task.id, { assigneeKind: 'human' }),
            disabled: task.assigneeKind === 'human',
          },
          {
            id: 'assignee-jovie',
            label: 'Jovie',
            icon: (
              <span aria-hidden='true'>
                <TaskAssigneeLeadingVisual assigneeKind='jovie' />
              </span>
            ),
            onClick: () => updateTaskField(task.id, { assigneeKind: 'jovie' }),
            disabled: task.assigneeKind === 'jovie',
          },
        ],
      },
    ],
    [artistName, openReleaseSidebar, openTaskDocument, updateTaskField]
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

  const headerActions = useMemo(
    () => (
      <DashboardHeaderActionGroup>
        <DashboardHeaderActionButton
          ariaLabel='Create task'
          icon={<Plus className='h-3.5 w-3.5' />}
          label='New Task'
          onClick={() => setHeaderMode('create')}
          pressed={headerMode === 'create'}
          hideLabelOnMobile
        />
      </DashboardHeaderActionGroup>
    ),
    [headerMode]
  );

  useEffect(() => {
    setHeaderActions(headerActions);

    return () => {
      setHeaderActions(null);
    };
  }, [headerActions, setHeaderActions]);

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
              isSelected={info.row.original.id === effectiveSelectedTaskId}
              actionSlot={
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
                    className='inline-flex h-7 w-7 items-center justify-center rounded-full bg-transparent text-tertiary-token transition-[background-color,color,box-shadow] duration-150 hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:bg-surface-1 focus-visible:text-primary-token focus-visible:shadow-[inset_0_0_0_1px_var(--linear-border-focus)]'
                  >
                    <MoreVertical className='h-3.5 w-3.5' />
                  </button>
                </TableActionMenu>
              }
            />
          ),
          meta: { className: 'pl-2 pr-2.5' },
        }),
      ] as ColumnDef<TaskView, unknown>[],
    [
      artistName,
      effectiveSelectedTaskId,
      getTaskContextMenuItems,
      openReleaseSidebar,
    ]
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
        setHeaderMode('default');
      });
    } catch {
      toast.error("Couldn't create task");
    }
  };

  return (
    <PageShell className='overflow-hidden' data-testid='tasks-workspace'>
      <section
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] bg-[color-mix(in_oklab,var(--linear-app-content-surface)_98%,transparent)]'
        )}
        data-testid='tasks-content-panel'
      >
        <TaskWorkspaceHeaderBar
          mode={headerMode}
          search={search}
          draftTitle={draftTitle}
          taskCount={tasks.length}
          onSearchChange={value => {
            setSearch(value);
            if (headerMode === 'default') {
              setHeaderMode('search');
            }
          }}
          onDraftTitleChange={setDraftTitle}
          onEnterSearch={() => setHeaderMode('search')}
          onExitSearch={() => setHeaderMode('default')}
          onCancelCreate={() => {
            setDraftTitle('');
            setHeaderMode('default');
          }}
          onSubmitCreate={handleCreateTask}
          createPending={createTaskMutation.isPending}
          filterCategories={taskFilterCategories}
          onClearFilters={clearFilters}
          showTaskNavigation={isXlUp && Boolean(selectedTask)}
          canSelectPrevious={canSelectPrevious}
          canSelectNext={canSelectNext}
          onSelectPrevious={selectPreviousTask}
          onSelectNext={selectNextTask}
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
                'xl:w-[31rem] 2xl:w-[33rem] min-[1800px]:w-[35rem] xl:border-r xl:border-[color-mix(in_oklab,var(--linear-app-shell-border)_74%,transparent)]',
                showTaskListPane ? 'block' : 'hidden',
                !selectedTask && 'flex-1'
              )}
            >
              {showTaskWorkbenchEmptyState ? (
                <div className='flex h-full items-center justify-center px-6 py-6'>
                  <div className='w-full max-w-[26rem] px-6 py-8'>
                    <TaskEmptyState
                      hasFilters={hasFilters}
                      onClearFilters={clearFilters}
                      onOpenComposer={() => setHeaderMode('create')}
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
                  containerClassName='h-full overflow-x-hidden pl-1.5 pr-3 pb-2 pt-0.5'
                  onRowClick={row => openTaskDocument(row)}
                  getContextMenuItems={getTaskContextMenuItems}
                  getRowClassName={_row =>
                    cn(
                      'group/task-row bg-transparent shadow-none hover:bg-transparent focus-within:shadow-none focus-visible:bg-transparent focus-visible:shadow-none'
                    )
                  }
                  emptyState={
                    <TaskEmptyState
                      hasFilters={hasFilters}
                      onClearFilters={clearFilters}
                      onOpenComposer={() => setHeaderMode('create')}
                    />
                  }
                />
              )}
            </div>
            <div
              className={cn(
                'min-h-0 min-w-0 flex-1',
                showTaskDocumentPane ? 'flex' : 'hidden'
              )}
              data-testid='task-document-pane'
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
                  isDesktopLayout={isXlUp}
                />
              ) : (
                <TaskDocumentPanel
                  task={null}
                  title=''
                  description=''
                  onTitleChange={NOOP}
                  onDescriptionChange={NOOP}
                  onClose={NOOP}
                  onOpenRelease={NOOP_TASK_OPEN}
                  onUpdateStatus={NOOP_TASK_STATUS_UPDATE}
                  onUpdatePriority={NOOP_TASK_PRIORITY_UPDATE}
                  onUpdateAssignee={NOOP_TASK_ASSIGNEE_UPDATE}
                  artistName={artistName}
                  isDesktopLayout={isXlUp}
                />
              )}
            </div>
          </div>
        )}
      </section>
    </PageShell>
  );
}
