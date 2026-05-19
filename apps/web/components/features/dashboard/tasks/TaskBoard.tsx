'use client';

import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { UserAvatar } from '@jovie/ui';
import { Disc3, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ReleaseDueBadge } from '@/components/molecules/ReleaseDueBadge';
import { type ContextMenuItemType } from '@/components/organisms/table';
import { TASK_BOARD_STATUSES } from '@/lib/tasks/task-board';
import type {
  MoveTaskInput,
  TaskBoardColumnResult,
  TaskBoardResult,
  TaskStatus,
  TaskView,
} from '@/lib/tasks/types';
import { getAccentCssVars } from '@/lib/ui/accent-palette';
import { cn } from '@/lib/utils';
import { PriorityBars } from './TaskListRow';
import { TaskRowActionMenu } from './TaskRowActionMenu';
import {
  getTaskAssigneeVisual,
  getTaskPriorityVisual,
  getTaskStageVisual,
  getTaskStatusVisual,
} from './task-presentation';

interface TaskBoardProps {
  readonly board: TaskBoardResult | undefined;
  readonly visibleStatuses: ReadonlyArray<TaskStatus>;
  readonly isLoading: boolean;
  readonly artistName?: string | null;
  readonly selectedTaskId: string | null;
  readonly onOpenTask: (task: TaskView) => void;
  readonly onCreateTask: () => void;
  readonly onMoveTask: (input: MoveTaskInput) => void;
  readonly getTaskContextMenuItems: (task: TaskView) => ContextMenuItemType[];
}

const TASK_AGENT_STATUS_LABELS: Partial<
  Record<TaskView['agentStatus'], string>
> = {
  queued: 'Queued',
  drafting: 'Drafting',
  awaiting_review: 'Awaiting Review',
  approved: 'Approved',
  failed: 'Failed',
};

function getColumnDroppableId(status: TaskStatus): string {
  return `task-board-column:${status}`;
}

function getStatusFromColumnDroppableId(id: string): TaskStatus | null {
  const status = id.replace('task-board-column:', '');
  return TASK_BOARD_STATUSES.includes(status as TaskStatus)
    ? (status as TaskStatus)
    : null;
}

function findBoardTask(
  columns: ReadonlyArray<TaskBoardColumnResult>,
  taskId: string
): TaskView | null {
  for (const column of columns) {
    const task = column.tasks.find(candidate => candidate.id === taskId);
    if (task) return task;
  }

  return null;
}

function findTaskStatus(
  columns: ReadonlyArray<TaskBoardColumnResult>,
  taskId: string
): TaskStatus | null {
  return (
    columns.find(column => column.tasks.some(task => task.id === taskId))
      ?.status ?? null
  );
}

function resolveDropInsertIndex({
  overTaskIndex,
  destinationLength,
  isSameColumn,
  sourceIndex,
  overIndex,
}: Readonly<{
  overTaskIndex: number;
  destinationLength: number;
  isSameColumn: boolean;
  sourceIndex: number;
  overIndex: number;
}>): number {
  if (overTaskIndex === -1) {
    return destinationLength;
  }

  if (isSameColumn && sourceIndex < overIndex) {
    return overTaskIndex + 1;
  }

  return overTaskIndex;
}

function resolveTaskBoardMoveInput({
  activeTaskId,
  overId,
  columns,
}: Readonly<{
  activeTaskId: string;
  overId: string;
  columns: ReadonlyArray<TaskBoardColumnResult>;
}>): MoveTaskInput | null {
  const activeTask = findBoardTask(columns, activeTaskId);
  if (!activeTask || activeTask.id === overId) {
    return null;
  }

  const overColumnStatus =
    getStatusFromColumnDroppableId(overId) ?? findTaskStatus(columns, overId);
  if (!overColumnStatus) {
    return null;
  }

  const destinationColumn = columns.find(
    column => column.status === overColumnStatus
  );
  if (!destinationColumn) {
    return null;
  }

  const destinationTasksWithoutActive = destinationColumn.tasks.filter(
    task => task.id !== activeTaskId
  );
  const overTaskIndex = destinationTasksWithoutActive.findIndex(
    task => task.id === overId
  );
  const sourceColumn = columns.find(
    column => column.status === activeTask.status
  );
  const sourceIndex =
    sourceColumn?.tasks.findIndex(task => task.id === activeTaskId) ?? -1;
  const overIndex =
    destinationColumn.tasks.findIndex(task => task.id === overId) ?? -1;
  const insertIndex = resolveDropInsertIndex({
    overTaskIndex,
    destinationLength: destinationTasksWithoutActive.length,
    isSameColumn: activeTask.status === overColumnStatus,
    sourceIndex,
    overIndex,
  });
  const beforeTaskId = destinationTasksWithoutActive[insertIndex]?.id ?? null;
  const afterTaskId =
    destinationTasksWithoutActive[insertIndex - 1]?.id ?? null;

  if (activeTask.status === overColumnStatus && sourceColumn) {
    const sourceTasksWithoutActive = sourceColumn.tasks.filter(
      task => task.id !== activeTaskId
    );
    const currentBeforeTaskId =
      sourceTasksWithoutActive[sourceIndex]?.id ?? null;
    const currentAfterTaskId =
      sourceTasksWithoutActive[sourceIndex - 1]?.id ?? null;

    if (
      currentBeforeTaskId === beforeTaskId &&
      currentAfterTaskId === afterTaskId
    ) {
      return null;
    }
  }

  return {
    taskId: activeTaskId,
    toStatus: overColumnStatus,
    beforeTaskId,
    afterTaskId,
  };
}

function useVisibleTaskBoardColumns({
  board,
  visibleStatuses,
}: Readonly<{
  board: TaskBoardResult | undefined;
  visibleStatuses: ReadonlyArray<TaskStatus>;
}>): TaskBoardColumnResult[] {
  return useMemo(
    () =>
      visibleStatuses.map(status => {
        const column = board?.columns.find(
          candidate => candidate.status === status
        );
        return (
          column ?? {
            status,
            tasks: [],
            totalCount: 0,
            nextCursor: null,
          }
        );
      }),
    [board?.columns, visibleStatuses]
  );
}

export function TaskBoard({
  board,
  visibleStatuses,
  isLoading,
  artistName,
  selectedTaskId,
  onOpenTask,
  onCreateTask,
  onMoveTask,
  getTaskContextMenuItems,
}: Readonly<TaskBoardProps>) {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const columns = useVisibleTaskBoardColumns({ board, visibleStatuses });
  const activeTask = activeTaskId ? findBoardTask(columns, activeTaskId) : null;
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTaskId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTaskId(null);

    if (!event.over) {
      return;
    }

    const input = resolveTaskBoardMoveInput({
      activeTaskId: String(event.active.id),
      overId: String(event.over.id),
      columns,
    });

    if (input) {
      onMoveTask(input);
    }
  };

  if (isLoading) {
    return <TaskBoardSkeleton />;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveTaskId(null)}
    >
      <div
        className='grid h-full min-h-0 min-w-full gap-3 overflow-x-auto overflow-y-hidden px-3 pb-3 pt-1.5'
        data-testid='tasks-board'
        style={{
          gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(17.5rem, 1fr))`,
        }}
      >
        {columns.map(column => (
          <TaskBoardColumn
            key={column.status}
            column={column}
            artistName={artistName}
            selectedTaskId={selectedTaskId}
            onOpenTask={onOpenTask}
            onCreateTask={onCreateTask}
            getTaskContextMenuItems={getTaskContextMenuItems}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <TaskBoardCard
            task={activeTask}
            artistName={artistName}
            selected={false}
            draggingOverlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function TaskBoardColumn({
  column,
  artistName,
  selectedTaskId,
  onOpenTask,
  onCreateTask,
  getTaskContextMenuItems,
}: Readonly<{
  column: TaskBoardColumnResult;
  artistName?: string | null;
  selectedTaskId: string | null;
  onOpenTask: (task: TaskView) => void;
  onCreateTask: () => void;
  getTaskContextMenuItems: (task: TaskView) => ContextMenuItemType[];
}>) {
  const visual = getTaskStatusVisual(column.status);
  const accent = getAccentCssVars(visual.accent);
  const StatusIcon = visual.icon;
  const { setNodeRef, isOver } = useDroppable({
    id: getColumnDroppableId(column.status),
    data: { type: 'column', status: column.status },
  });

  return (
    <section
      ref={setNodeRef}
      aria-label={`${visual.label} tasks`}
      data-testid={`tasks-board-column-${column.status}`}
      className={cn(
        'flex h-full min-h-0 w-full min-w-0 flex-col rounded-lg border border-subtle bg-surface-0',
        isOver &&
          'border-[color-mix(in_oklab,var(--linear-border-focus)_70%,transparent)] bg-[color-mix(in_oklab,var(--linear-row-hover)_36%,var(--linear-app-content-surface))]'
      )}
    >
      <div className='flex h-10 min-h-10 items-center justify-between gap-2 border-b border-subtle px-3'>
        <div className='flex min-w-0 items-center gap-2'>
          <StatusIcon
            className={cn(
              'h-3.5 w-3.5 shrink-0',
              visual.filled && 'fill-current'
            )}
            style={{ color: accent.solid }}
          />
          <h2 className='truncate text-[12.5px] font-semibold text-primary-token'>
            {visual.label}
          </h2>
          <span className='text-[10.5px] tabular-nums text-tertiary-token'>
            {column.totalCount}
          </span>
        </div>
        <button
          type='button'
          onClick={onCreateTask}
          aria-label={`Create ${visual.label} task`}
          className='inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-tertiary-token transition-[background-color,color] hover:bg-[color-mix(in_oklab,var(--linear-row-hover)_64%,transparent)] hover:text-primary-token focus-visible:outline-none focus-visible:bg-[color-mix(in_oklab,var(--linear-row-hover)_70%,transparent)] focus-visible:text-primary-token'
        >
          <Plus className='h-3.5 w-3.5' />
        </button>
      </div>

      <SortableContext
        items={column.tasks.map(task => task.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className='min-h-0 flex-1 space-y-2 overflow-y-auto px-2.5 py-2.5'>
          {column.tasks.length === 0 ? (
            <div className='flex min-h-[7rem] items-center justify-center rounded-md border border-dashed border-subtle px-4 text-center text-[11.5px] leading-relaxed text-tertiary-token'>
              Drop tasks here
            </div>
          ) : (
            column.tasks.map(task => (
              <SortableTaskBoardCard
                key={task.id}
                task={task}
                artistName={artistName}
                selected={task.id === selectedTaskId}
                onOpenTask={onOpenTask}
                getTaskContextMenuItems={getTaskContextMenuItems}
              />
            ))
          )}
          {column.nextCursor ? (
            <p className='px-1 pb-1 text-center text-[10.5px] text-tertiary-token'>
              Showing {column.tasks.length} of {column.totalCount}
            </p>
          ) : null}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableTaskBoardCard({
  task,
  artistName,
  selected,
  onOpenTask,
  getTaskContextMenuItems,
}: Readonly<{
  task: TaskView;
  artistName?: string | null;
  selected: boolean;
  onOpenTask: (task: TaskView) => void;
  getTaskContextMenuItems: (task: TaskView) => ContextMenuItemType[];
}>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: 'task', task },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        'group/task-board-card-shell relative',
        isDragging && 'opacity-45'
      )}
    >
      <button
        type='button'
        {...attributes}
        {...listeners}
        data-testid={`task-board-card-${task.id}`}
        onClick={() => onOpenTask(task)}
        className='block w-full cursor-grab text-left active:cursor-grabbing focus-visible:outline-none'
      >
        <TaskBoardCard
          task={task}
          artistName={artistName}
          selected={selected}
        />
      </button>
      <div className='absolute right-2 top-2'>
        <TaskRowActionMenu
          items={getTaskContextMenuItems(task)}
          selected={selected}
          visibility='hover'
        />
      </div>
    </div>
  );
}

function TaskBoardCard({
  task,
  artistName,
  selected,
  draggingOverlay = false,
}: Readonly<{
  task: TaskView;
  artistName?: string | null;
  selected: boolean;
  draggingOverlay?: boolean;
}>) {
  const stage = getTaskStageVisual(task.status, task.agentStatus);
  const stageAccent = getAccentCssVars(stage.accent);
  const priority = getTaskPriorityVisual(task.priority);
  const priorityAccent = getAccentCssVars(priority.accent);
  const assignee = getTaskAssigneeVisual(task.assigneeKind, artistName);
  const agentLabel = TASK_AGENT_STATUS_LABELS[task.agentStatus];
  const StageIcon = stage.icon;

  return (
    <div
      className={cn(
        'group/task-board-card min-h-[7.25rem] w-full rounded-lg border border-subtle bg-surface-1 px-3 py-2.5 text-left shadow-card transition-[background-color,border-color,box-shadow,opacity]',
        draggingOverlay ? 'cursor-grabbing' : 'cursor-grab',
        'hover:border-subtle hover:bg-surface-2 hover:shadow-card-elevated',
        'focus-visible:outline-none focus-visible:border-[color-mix(in_oklab,var(--linear-border-focus)_74%,transparent)] focus-visible:shadow-[inset_0_0_0_1px_var(--linear-border-focus)]',
        selected &&
          'border-[color-mix(in_oklab,var(--linear-border-focus)_70%,transparent)] bg-[color-mix(in_oklab,var(--linear-row-hover)_52%,var(--linear-app-content-surface))]',
        draggingOverlay && 'w-[19rem] shadow-[0_12px_36px_rgba(0,0,0,0.36)]'
      )}
    >
      <div className='flex items-start justify-between gap-2'>
        <div className='flex min-w-0 items-center gap-1.5 text-[10.5px] font-semibold text-tertiary-token'>
          <StageIcon
            className={cn(
              'h-3.5 w-3.5 shrink-0',
              task.status === 'done' && 'fill-current'
            )}
            style={{ color: stageAccent.solid }}
          />
          <span className='shrink-0'>J-{task.taskNumber}</span>
        </div>
        <span className='h-7 w-7' aria-hidden='true' />
      </div>

      <p className='mt-1.5 line-clamp-2 text-[12.75px] font-semibold leading-[17px] text-primary-token'>
        {task.title}
      </p>

      <div className='mt-2.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-[10.5px] leading-none text-secondary-token'>
        <span className='inline-flex items-center gap-1 text-secondary-token'>
          <PriorityBars
            bars={priority.bars}
            accentColor={priorityAccent.solid}
          />
          <span>{priority.label}</span>
        </span>
        <span className='inline-flex min-w-0 items-center gap-1.5'>
          <UserAvatar name={assignee.avatarName} size='xs' />
          <span className='truncate'>{assignee.label}</span>
        </span>
        {agentLabel ? (
          <span
            className={cn(
              'rounded-full border px-1.5 py-0.5 text-[10px] font-semibold',
              task.agentStatus === 'failed'
                ? 'border-error/30 text-error'
                : 'border-subtle text-tertiary-token'
            )}
          >
            {agentLabel}
          </span>
        ) : null}
      </div>

      <div className='mt-2.5 flex min-h-5 min-w-0 items-center justify-between gap-2'>
        <div className='min-w-0 flex-1'>
          {task.releaseTitle ? (
            <span
              className='inline-flex max-w-full items-center gap-1 text-[10.5px] text-tertiary-token'
              title={task.releaseTitle}
            >
              <Disc3 className='h-3 w-3 shrink-0' />
              <span className='truncate'>{task.releaseTitle}</span>
            </span>
          ) : null}
        </div>
        {task.dueAt ? (
          <ReleaseDueBadge
            dueDate={task.dueAt}
            dueDaysOffset={null}
            isCompleted={task.status === 'done' || task.status === 'cancelled'}
          />
        ) : null}
      </div>
    </div>
  );
}

function TaskBoardSkeleton() {
  return (
    <div
      className='grid h-full min-h-0 min-w-full gap-3 overflow-hidden px-3 pb-3 pt-1.5'
      style={{ gridTemplateColumns: 'repeat(4, minmax(17.5rem, 1fr))' }}
    >
      {[0, 1, 2, 3].map(column => (
        <div
          key={column}
          className='flex h-full min-h-0 w-full min-w-0 flex-col rounded-lg border border-subtle bg-surface-0'
        >
          <div className='h-10 border-b border-subtle px-3 py-3'>
            <div className='h-3 w-24 rounded bg-surface-2' />
          </div>
          <div className='space-y-2 px-2.5 py-2.5'>
            {[0, 1, 2].map(card => (
              <div
                key={card}
                className='h-[7.25rem] animate-pulse rounded-lg border border-subtle bg-surface-1 p-3'
              >
                <div className='h-2.5 w-14 rounded bg-surface-2' />
                <div className='mt-3 h-3 w-11/12 rounded bg-surface-2' />
                <div className='mt-2 h-3 w-7/12 rounded bg-surface-2' />
                <div className='mt-4 h-2.5 w-20 rounded bg-surface-2' />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
