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
  Search,
  Trash2,
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
import { TaskDescriptionHelper } from '@/components/features/dashboard/tasks/TaskDescriptionHelper';
import {
  PriorityBars,
  TaskListRow,
} from '@/components/features/dashboard/tasks/TaskListRow';
import {
  HIDDEN_DIV_STYLES,
  useTextareaAutosize,
} from '@/components/jovie/hooks/useTextareaAutosize';
import {
  TOOLBAR_MENU_CONTENT_CLASS,
  TOOLBAR_MENU_SEPARATOR_CLASS,
  ToolbarMenuChoiceItem,
} from '@/components/molecules/menus/ToolbarMenuPrimitives';
import { ReleaseDueBadge } from '@/components/molecules/ReleaseDueBadge';
import { PageShell } from '@/components/organisms/PageShell';
import { ReleaseSidebar } from '@/components/organisms/release-sidebar';
import {
  type ContextMenuItemType,
  convertContextMenuItems,
  UnifiedTable,
} from '@/components/organisms/table';
import { resolveTableNavAction } from '@/components/organisms/table/utils/tableKeyMap';
import { APP_ROUTES } from '@/constants/routes';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import { useReleasesQuery } from '@/lib/queries/useReleasesQuery';
import {
  useCreateTaskMutation,
  useDeleteTaskMutation,
  useUpdateTaskMutation,
} from '@/lib/queries/useTaskMutations';
import { useTaskQuery, useTasksQuery } from '@/lib/queries/useTasksQuery';
import { DEFAULT_RELEASE_TASK_TEMPLATE } from '@/lib/release-tasks/default-template';
import {
  readTaskDescriptionHelper,
  type TaskDescriptionHelperPayload,
} from '@/lib/tasks/task-description-helper';
import type {
  TaskAssigneeKind,
  TaskPriority,
  TaskStatus,
  TaskView,
} from '@/lib/tasks/types';
import { getAccentCssVars } from '@/lib/ui/accent-palette';
import { cn } from '@/lib/utils';
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

const TASK_WORKSPACE_PANE_CLASSNAME = 'min-h-0 overflow-hidden';

type MobileTaskScope = 'all' | 'open' | 'done';

const MOBILE_TASK_SCOPE_OPTIONS = [
  ['all', 'All'],
  ['open', 'Open'],
  ['done', 'Closed'],
] as const satisfies ReadonlyArray<readonly [MobileTaskScope, string]>;

function isTaskClosed(task: Readonly<TaskView>): boolean {
  return task.status === 'done' || task.status === 'cancelled';
}

function compareTaskCompletionOrder(
  left: Readonly<TaskView>,
  right: Readonly<TaskView>
): number {
  const leftDone = left.status === 'done';
  const rightDone = right.status === 'done';

  if (leftDone === rightDone) {
    return 0;
  }

  return leftDone ? 1 : -1;
}

function getMobileScopedTasks(
  tasks: ReadonlyArray<TaskView>,
  scope: MobileTaskScope
): TaskView[] {
  if (scope === 'open') {
    return tasks.filter(task => !isTaskClosed(task));
  }

  if (scope === 'done') {
    return tasks.filter(isTaskClosed);
  }

  return [...tasks];
}

function partitionTasksForMobile(tasks: ReadonlyArray<TaskView>): {
  readonly activeTasks: TaskView[];
  readonly completedTasks: TaskView[];
} {
  return {
    activeTasks: tasks.filter(task => !isTaskClosed(task)),
    completedTasks: tasks.filter(isTaskClosed),
  };
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
      <span className='font-semibold text-secondary-token'>{stage.label}</span>
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
      <PriorityBars bars={visual.bars} accentColor={accent.solid} />
      <span className='font-semibold text-secondary-token'>{visual.label}</span>
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
      <span className='font-semibold text-secondary-token'>{meta.label}</span>
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
      <PriorityBars bars={visual.bars} accentColor={accent.solid} />
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
        '-mx-1 inline-flex min-w-0 items-center rounded-full px-1.5 py-1 text-secondary-token transition-[background-color,color] duration-150 hover:bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_70%,transparent)] hover:text-primary-token data-[state=open]:bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_82%,transparent)] data-[state=open]:text-primary-token',
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
          <span className='inline-flex items-center gap-1 text-2xs font-semibold text-tertiary-token'>
            <span className='shrink-0'>J-{task.taskNumber}</span>
            <ChevronDown className='h-3 w-3 shrink-0 text-tertiary-token' />
          </span>
        </TaskMetaTrigger>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='start'
        sideOffset={8}
        data-menu-surface='toolbar'
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

function findTemplateDescriptionHelper(
  title: string,
  category: string | null
): TaskDescriptionHelperPayload | null {
  return (
    DEFAULT_RELEASE_TASK_TEMPLATE.find(
      item =>
        item.descriptionHelper &&
        item.title === title &&
        item.category === category
    )?.descriptionHelper ?? null
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
  const descriptionEditorRef = useRef<HTMLTextAreaElement>(null);
  const [descriptionHelperDismissed, setDescriptionHelperDismissed] =
    useState(false);
  const metadataDescriptionHelper = readTaskDescriptionHelper(task?.metadata);
  const descriptionHelper =
    metadataDescriptionHelper ??
    (task?.releaseId
      ? findTemplateDescriptionHelper(task.title, task.category)
      : null);
  const showDescriptionHelper = Boolean(
    task &&
      descriptionHelper &&
      description.trim() === '' &&
      !descriptionHelperDismissed
  );

  useEffect(() => {
    setDescriptionHelperDismissed(false);
  }, [task?.id]);

  const focusDescriptionEditor = useCallback(() => {
    globalThis.requestAnimationFrame(() => {
      descriptionEditorRef.current?.focus();
    });
  }, []);

  const beginDescriptionEditing = useCallback(() => {
    setDescriptionHelperDismissed(true);
    focusDescriptionEditor();
  }, [focusDescriptionEditor]);

  const handleDescriptionFocus = useCallback(() => {
    if (descriptionHelper && description.trim() === '') {
      setDescriptionHelperDismissed(true);
    }
  }, [description, descriptionHelper]);

  if (!task) {
    return (
      <div className='flex min-h-0 flex-1 items-center justify-center px-6 py-6'>
        <div className='max-w-[34rem] px-6 py-10 text-center'>
          <div className='mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-surface-1 text-secondary-token'>
            <FileText className='h-5 w-5' />
          </div>
          <h2 className='mt-5 text-[21px] font-semibold tracking-[-0.03em] text-primary-token'>
            Select a task
          </h2>
        </div>
      </div>
    );
  }

  const hasRelease = Boolean(task.releaseId && task.releaseTitle);

  return (
    <div className='flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-2 pb-2 pr-2 pt-2'>
      <div className='flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'>
        <div
          className='min-h-0 flex-1 overflow-y-auto overscroll-contain'
          data-testid='task-document-scroll-region'
        >
          <div className='mx-auto flex w-full max-w-[40rem] flex-col gap-3 px-4 pb-5 pt-4 sm:px-5 sm:pb-6 sm:pt-5'>
            <TaskTitleEditor value={title} onChange={onTitleChange} />

            <div className='flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[color-mix(in_oklab,var(--linear-app-frame-seam)_68%,transparent)] pb-3 text-2xs text-secondary-token'>
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
                  data-menu-surface='toolbar'
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
                  data-menu-surface='toolbar'
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
                  data-menu-surface='toolbar'
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
                  <span className='truncate font-semibold'>
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

            <div className='relative'>
              <textarea
                ref={descriptionEditorRef}
                id='task-context-editor'
                aria-label='Task description'
                value={description}
                onFocus={handleDescriptionFocus}
                onChange={event => onDescriptionChange(event.target.value)}
                placeholder='Start writing...'
                className='min-h-[520px] w-full resize-none border-0 bg-transparent px-0 py-0 text-mid leading-[1.8] text-primary-token outline-none placeholder:text-[color-mix(in_oklab,var(--text-tertiary)_82%,transparent)]'
              />
              {showDescriptionHelper && descriptionHelper ? (
                <TaskDescriptionHelper
                  helper={descriptionHelper}
                  onBeginEditing={beginDescriptionEditing}
                />
              ) : null}
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
      minHeight: 48,
      maxHeight: 176,
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
        className='w-full resize-none border-0 bg-transparent px-0 py-0 text-[clamp(1.55rem,1.9vw,2.15rem)] font-semibold leading-[1.06] tracking-[-0.04em] text-primary-token outline-none placeholder:text-[color-mix(in_oklab,var(--text-tertiary)_80%,transparent)]'
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
          fontSize: 'clamp(1.55rem, 1.9vw, 2.15rem)',
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
        <h2 className='text-lg font-semibold tracking-[-0.025em] text-primary-token'>
          {hasFilters
            ? 'No tasks match your filters'
            : 'Your task list is empty'}
        </h2>
        <p className='max-w-[520px] text-app text-secondary-token'>
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

function MobileTaskScopeTabs({
  scope,
  counts,
  onChange,
}: Readonly<{
  scope: MobileTaskScope;
  counts: Readonly<Record<MobileTaskScope, number>>;
  onChange: (scope: MobileTaskScope) => void;
}>) {
  return (
    <div className='px-3 pb-1 pt-2'>
      <div className='inline-flex rounded-full bg-surface-1 p-1'>
        {MOBILE_TASK_SCOPE_OPTIONS.map(([value, label]) => {
          const isActive = scope === value;

          return (
            <button
              key={value}
              type='button'
              onClick={() => onChange(value)}
              aria-pressed={isActive}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-2xs font-semibold transition-[background-color,color] duration-150',
                isActive
                  ? 'bg-[color-mix(in_oklab,var(--linear-app-content-surface)_96%,transparent)] text-primary-token shadow-[0_0_0_1px_color-mix(in_oklab,var(--linear-app-shell-border)_72%,transparent)]'
                  : 'text-secondary-token hover:text-primary-token'
              )}
            >
              <span>{label}</span>
              <span className='text-3xs text-tertiary-token'>
                {counts[value]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MobileTaskSection({
  title,
  tasks,
  selectedTaskId,
  artistName,
  onOpenTask,
  onOpenRelease,
}: Readonly<{
  title: string;
  tasks: ReadonlyArray<TaskView>;
  selectedTaskId: string | null;
  artistName?: string | null;
  onOpenTask: (task: TaskView) => void;
  onOpenRelease: (task: TaskView) => void;
}>) {
  if (tasks.length === 0) {
    return null;
  }

  return (
    <section className='px-3 pb-4'>
      <div className='mb-2 flex items-center justify-between px-1'>
        <h2 className='text-2xs font-semibold text-tertiary-token'>{title}</h2>
        <span className='text-3xs text-tertiary-token'>{tasks.length}</span>
      </div>
      <div className='overflow-hidden rounded-[18px] bg-[color-mix(in_oklab,var(--linear-app-content-surface)_98%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--linear-app-shell-border)_65%,transparent)]'>
        {tasks.map(task => (
          <MobileTaskListItem
            key={task.id}
            task={task}
            artistName={artistName}
            onOpenTask={onOpenTask}
            onOpenRelease={onOpenRelease}
            isSelected={task.id === selectedTaskId}
          />
        ))}
      </div>
    </section>
  );
}

function MobileTaskListItem({
  task,
  artistName,
  onOpenTask,
  onOpenRelease,
  isSelected,
}: Readonly<{
  task: TaskView;
  artistName?: string | null;
  onOpenTask: (task: TaskView) => void;
  onOpenRelease: (task: TaskView) => void;
  isSelected: boolean;
}>) {
  const stage = getTaskStageVisual(task.status, task.agentStatus);
  const priority = getTaskPriorityVisual(task.priority);
  const assignee = getTaskAssigneeVisual(task.assigneeKind, artistName);
  const accent = getAccentCssVars(stage.accent);
  const priorityAccent = getAccentCssVars(priority.accent);
  const StageIcon = stage.icon;

  return (
    <button
      type='button'
      onClick={() => onOpenTask(task)}
      data-testid='mobile-task-row'
      className={cn(
        'flex w-full items-start gap-3 border-b border-[color-mix(in_oklab,var(--linear-app-shell-border)_58%,transparent)] px-4 py-3 text-left transition-[background-color,color] duration-150 last:border-b-0',
        isSelected
          ? 'bg-[color-mix(in_oklab,var(--linear-row-hover)_68%,var(--linear-app-content-surface))]'
          : 'bg-transparent hover:bg-[color-mix(in_oklab,var(--linear-row-hover)_56%,transparent)]'
      )}
    >
      <span
        className='mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center'
        style={{ color: accent.solid }}
      >
        <StageIcon
          className={cn(
            'h-3.5 w-3.5',
            task.status === 'done' && 'fill-current'
          )}
        />
      </span>

      <span className='min-w-0 flex-1'>
        <span className='block truncate text-sm font-semibold leading-[1.25] text-primary-token'>
          {task.title}
        </span>
        <span className='mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-secondary-token'>
          <span className='truncate'>{stage.label}</span>
          <span className='text-tertiary-token'>J-{task.taskNumber}</span>
          <span className='inline-flex items-center gap-1'>
            <PriorityBars
              bars={priority.bars}
              accentColor={priorityAccent.solid}
            />
            <span>{priority.label}</span>
          </span>
          <span className='truncate'>{assignee.label}</span>
        </span>
        {task.releaseTitle ? (
          <span className='mt-1.5 flex min-w-0 items-center gap-1.5 text-[10.5px] text-tertiary-token'>
            <Disc3 className='h-3 w-3 shrink-0' />
            <span className='min-w-0 truncate'>{task.releaseTitle}</span>
          </span>
        ) : null}
      </span>

      <span className='mt-0.5 flex shrink-0 flex-col items-end gap-1'>
        {task.dueAt ? (
          <ReleaseDueBadge
            dueDate={task.dueAt}
            dueDaysOffset={null}
            isCompleted={task.status === 'done' || task.status === 'cancelled'}
          />
        ) : null}
        {task.releaseTitle ? (
          <span className='text-3xs font-semibold text-tertiary-token'>
            Release
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function TasksPageClient() {
  const { selectedProfile } = useDashboardData();
  const { setHeaderActions } = useSetHeaderActions();
  const isXlUp = useBreakpoint('xl');
  const canShowTaskDocumentAlongsideReleaseSidebar = useMediaQuery(
    '(min-width: 1720px)'
  );
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
  const [mobileScope, setMobileScope] = useState<MobileTaskScope>('all');
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
  const deleteTaskMutation = useDeleteTaskMutation();
  const updateTaskMutation = useUpdateTaskMutation();
  const { mutate: deleteTask } = deleteTaskMutation;
  const { mutate: updateTask, isPending: isUpdatingTask } = updateTaskMutation;
  const { data: releases = [] } = useReleasesQuery(profileId ?? '');

  // Fetch all tasks once — filter client-side for instant search
  const { data, isLoading, isError, refetch } = useTasksQuery(profileId);

  const tasks = useMemo(() => {
    const allTasks = data?.tasks ?? [];
    const searchLower = deferredSearch.trim().toLowerCase();

    const filtered = allTasks.filter(task => {
      if (searchLower && !task.title.toLowerCase().includes(searchLower))
        return false;
      if (statusFilter !== 'all' && task.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && task.priority !== priorityFilter)
        return false;
      if (assigneeFilter !== 'all' && task.assigneeKind !== assigneeFilter)
        return false;
      return true;
    });

    return [...filtered].sort(compareTaskCompletionOrder);
  }, [
    data?.tasks,
    deferredSearch,
    statusFilter,
    priorityFilter,
    assigneeFilter,
  ]);
  const mobileScopedTasks = useMemo(
    () => getMobileScopedTasks(tasks, mobileScope),
    [mobileScope, tasks]
  );
  const visibleTasks = isXlUp ? tasks : mobileScopedTasks;
  const effectiveSelectedTaskId =
    selectedTaskId ?? (isXlUp ? (visibleTasks[0]?.id ?? null) : null);
  const { data: selectedTaskData } = useTaskQuery(
    effectiveSelectedTaskId,
    profileId
  );
  const selectedTask =
    selectedTaskData ??
    visibleTasks.find(task => task.id === effectiveSelectedTaskId) ??
    tasks.find(task => task.id === effectiveSelectedTaskId) ??
    null;
  const selectedRelease =
    releases.find(release => release.id === selectedReleaseId) ?? null;
  const shouldPrioritizeRightPanel =
    Boolean(selectedRelease) && !canShowTaskDocumentAlongsideReleaseSidebar;
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
    setMobileScope('all');
  }, []);
  const showTaskWorkbenchEmptyState = !isLoading && tasks.length === 0;
  const selectedTaskIndex = effectiveSelectedTaskId
    ? visibleTasks.findIndex(task => task.id === effectiveSelectedTaskId)
    : -1;
  const canSelectPrevious = selectedTaskIndex > 0;
  const canSelectNext =
    selectedTaskIndex !== -1 && selectedTaskIndex < visibleTasks.length - 1;
  const mobileScopeCounts = useMemo(
    () => ({
      all: tasks.length,
      open: tasks.filter(task => !isTaskClosed(task)).length,
      done: tasks.filter(isTaskClosed).length,
    }),
    [tasks]
  );
  const mobileTaskSections = useMemo(
    () => partitionTasksForMobile(mobileScopedTasks),
    [mobileScopedTasks]
  );

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
      if (!canShowTaskDocumentAlongsideReleaseSidebar) {
        setSelectedReleaseId(null);
      }
      setSelectedTaskId(task.id);
    },
    [canShowTaskDocumentAlongsideReleaseSidebar]
  );

  // Close release sidebar when the active task changes — the sidebar is only
  // useful alongside the task that owns the release.
  useEffect(() => {
    setSelectedReleaseId(null);
  }, [effectiveSelectedTaskId]);

  useEffect(() => {
    if (!selectedReleaseId || canShowTaskDocumentAlongsideReleaseSidebar) {
      return;
    }

    setHeaderMode(current => (current === 'create' ? 'default' : current));
  }, [canShowTaskDocumentAlongsideReleaseSidebar, selectedReleaseId]);

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

    const hasVisibleSelection = visibleTasks.some(
      task => task.id === selectedTaskId
    );
    if (!hasVisibleSelection) {
      if (!isXlUp && selectedTaskId === null) {
        return;
      }

      setSelectedTaskId(visibleTasks[0]?.id ?? null);
    }
  }, [isLoading, isXlUp, selectedTaskId, tasks, visibleTasks]);

  const selectTaskByIndex = useCallback(
    (index: number) => {
      const nextTask = visibleTasks[index];
      if (!nextTask) {
        return;
      }

      openTaskDocument(nextTask);
    },
    [openTaskDocument, visibleTasks]
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
      if (!selectedTask) return;

      const action = resolveTableNavAction(event.key, event.target);
      if (action === 'next') {
        event.preventDefault();
        selectNextTask();
      } else if (action === 'prev') {
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

  const handleDeleteTask = useCallback(
    (task: TaskView) => {
      const shouldDelete = globalThis.confirm(
        `Delete "${task.title}"? This can't be undone.`
      );

      if (!shouldDelete) {
        return;
      }

      deleteTask(task.id, {
        onError: () => {
          toast.error("Couldn't delete task");
        },
      });
    },
    [deleteTask]
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
        label: 'Status',
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
        label: 'Priority',
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
        label: 'Assignee',
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
      { type: 'separator' },
      {
        id: 'delete-task',
        label: 'Delete Task',
        icon: <Trash2 className='h-4 w-4' />,
        destructive: true,
        onClick: () => handleDeleteTask(task),
      },
    ],
    [
      artistName,
      handleDeleteTask,
      openReleaseSidebar,
      openTaskDocument,
      updateTaskField,
    ]
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
                    className='inline-flex h-7 w-7 items-center justify-center rounded-full bg-transparent text-tertiary-token transition-[background-color,color] duration-150 hover:bg-[color-mix(in_oklab,var(--linear-row-hover)_56%,transparent)] hover:text-primary-token focus-visible:outline-none focus-visible:bg-[color-mix(in_oklab,var(--linear-row-hover)_60%,transparent)] focus-visible:text-primary-token'
                  >
                    <MoreVertical className='h-3.5 w-3.5' />
                  </button>
                </TableActionMenu>
              }
            />
          ),
          meta: { className: 'px-0' },
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
    <PageShell
      className='overflow-hidden'
      data-testid='tasks-workspace'
      toolbar={
        isXlUp || headerMode !== 'default' ? (
          <TaskWorkspaceHeaderBar
            mode={headerMode}
            search={search}
            draftTitle={draftTitle}
            taskCount={visibleTasks.length}
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
        ) : undefined
      }
    >
      <section
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-2 overflow-hidden pb-2'
        )}
        data-testid='tasks-content-panel'
      >
        {isError ? (
          <div className='flex min-h-[240px] flex-1 flex-col items-center justify-center gap-3 px-6 text-center'>
            <div className='space-y-1'>
              <h2 className='text-mid font-semibold text-primary-token'>
                Couldn&apos;t Load Tasks
              </h2>
              <p className='text-app text-secondary-token'>
                Try reloading the task list.
              </p>
            </div>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={() => refetch()}
            >
              Retry
            </Button>
          </div>
        ) : (
          <div className='flex min-h-0 flex-1 overflow-hidden'>
            <div
              data-testid='task-list-pane'
              className={cn(
                'min-h-0 min-w-0',
                TASK_WORKSPACE_PANE_CLASSNAME,
                selectedTask && showTaskDocumentPane
                  ? 'xl:flex-none xl:basis-[32rem] xl:min-w-[28rem] xl:max-w-[36rem] xl:border-r xl:border-[color-mix(in_oklab,var(--linear-app-shell-border)_74%,transparent)]'
                  : 'flex-1',
                showTaskListPane ? 'block' : 'hidden',
                !selectedTask && 'xl:max-w-none'
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
              ) : isXlUp ? (
                <UnifiedTable
                  data={visibleTasks}
                  columns={columns}
                  isLoading={isLoading}
                  getRowId={row => row.id}
                  hideHeader
                  enableVirtualization={false}
                  rowHeight={64}
                  skeletonRows={8}
                  className='text-app'
                  containerClassName='h-full overflow-y-auto overflow-x-hidden px-2.5 pb-2 pt-0.5'
                  minWidth='100%'
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
              ) : (
                <div
                  className='flex h-full min-h-0 flex-col overflow-hidden'
                  data-testid='mobile-task-list'
                >
                  <div className='flex items-center justify-between px-4 pb-1 pt-3'>
                    <div>
                      <p className='text-xs text-secondary-token'>
                        {mobileScopeCounts.all} total tasks
                      </p>
                    </div>
                    <button
                      type='button'
                      onClick={() =>
                        setHeaderMode(current =>
                          current === 'search' ? 'default' : 'search'
                        )
                      }
                      aria-label='Search tasks'
                      className='inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface-1 text-secondary-token transition-[background-color,color] duration-150 hover:bg-surface-0 hover:text-primary-token'
                    >
                      <Search className='h-4 w-4' />
                    </button>
                  </div>
                  <MobileTaskScopeTabs
                    scope={mobileScope}
                    counts={mobileScopeCounts}
                    onChange={setMobileScope}
                  />
                  <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6'>
                    {mobileScopedTasks.length === 0 ? (
                      <div className='px-4 pt-6'>
                        <TaskEmptyState
                          hasFilters={hasFilters || mobileScope !== 'all'}
                          onClearFilters={clearFilters}
                          onOpenComposer={() => setHeaderMode('create')}
                        />
                      </div>
                    ) : mobileScope === 'all' ? (
                      <>
                        <MobileTaskSection
                          title='Open'
                          tasks={mobileTaskSections.activeTasks}
                          selectedTaskId={selectedTaskId}
                          artistName={artistName}
                          onOpenTask={openTaskDocument}
                          onOpenRelease={openReleaseSidebar}
                        />
                        <MobileTaskSection
                          title='Closed'
                          tasks={mobileTaskSections.completedTasks}
                          selectedTaskId={selectedTaskId}
                          artistName={artistName}
                          onOpenTask={openTaskDocument}
                          onOpenRelease={openReleaseSidebar}
                        />
                      </>
                    ) : (
                      <MobileTaskSection
                        title={mobileScope === 'open' ? 'Open' : 'Closed'}
                        tasks={mobileScopedTasks}
                        selectedTaskId={selectedTaskId}
                        artistName={artistName}
                        onOpenTask={openTaskDocument}
                        onOpenRelease={openReleaseSidebar}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
            <div
              className={cn(
                'min-h-0 min-w-0 flex-1 overflow-hidden',
                TASK_WORKSPACE_PANE_CLASSNAME,
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
