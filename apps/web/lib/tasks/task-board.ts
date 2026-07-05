import type {
  MoveTaskInput,
  TaskBoardColumnResult,
  TaskBoardResult,
  TaskListResult,
  TaskStatus,
  TaskView,
} from './types';

export const TASK_BOARD_STATUSES = [
  'backlog',
  'todo',
  'in_progress',
  'done',
  'cancelled',
] as const satisfies readonly TaskStatus[];

export const DEFAULT_VISIBLE_TASK_BOARD_STATUSES = [
  'backlog',
  'todo',
  'in_progress',
  'done',
] as const satisfies readonly TaskStatus[];

export const TASK_STATUS_RANK: Record<TaskStatus, number> = {
  backlog: 0,
  todo: 1,
  in_progress: 2,
  done: 3,
  cancelled: 4,
};

export function isTaskStatus(value: string): value is TaskStatus {
  return TASK_BOARD_STATUSES.includes(value as TaskStatus);
}

export function compareTasksByBoardOrder(
  left: Readonly<TaskView>,
  right: Readonly<TaskView>
): number {
  const statusOrder =
    TASK_STATUS_RANK[left.status] - TASK_STATUS_RANK[right.status];
  if (statusOrder !== 0) return statusOrder;

  const positionOrder = left.position - right.position;
  if (positionOrder !== 0) return positionOrder;

  const createdOrder = left.createdAt.getTime() - right.createdAt.getTime();
  if (createdOrder !== 0) return createdOrder;

  return left.id.localeCompare(right.id);
}

export function getVisibleTaskBoardStatuses({
  statusFilter,
  showCancelled,
}: Readonly<{
  statusFilter: TaskStatus | 'all';
  showCancelled: boolean;
}>): TaskStatus[] {
  if (statusFilter !== 'all') {
    return [statusFilter];
  }

  return TASK_BOARD_STATUSES.filter(status =>
    status === 'cancelled'
      ? showCancelled
      : DEFAULT_VISIBLE_TASK_BOARD_STATUSES.includes(
          status as (typeof DEFAULT_VISIBLE_TASK_BOARD_STATUSES)[number]
        )
  );
}

function findTaskInBoard(
  board: TaskBoardResult | undefined,
  taskId: string
): TaskView | null {
  if (!board) return null;

  for (const column of board.columns) {
    const task = column.tasks.find(candidate => candidate.id === taskId);
    if (task) return task;
  }

  return null;
}

export function getTaskBoardColumnDroppableId(status: TaskStatus): string {
  return `task-board-column:${status}`;
}

export function getTaskStatusFromBoardColumnDroppableId(
  id: string
): TaskStatus | null {
  const status = id.replace('task-board-column:', '');
  return TASK_BOARD_STATUSES.includes(status as TaskStatus)
    ? (status as TaskStatus)
    : null;
}

function findTaskInBoardColumns(
  columns: ReadonlyArray<TaskBoardColumnResult>,
  taskId: string
): TaskView | null {
  for (const column of columns) {
    const task = column.tasks.find(candidate => candidate.id === taskId);
    if (task) return task;
  }

  return null;
}

function findTaskStatusInBoardColumns(
  columns: ReadonlyArray<TaskBoardColumnResult>,
  taskId: string
): TaskStatus | null {
  return (
    columns.find(column => column.tasks.some(task => task.id === taskId))
      ?.status ?? null
  );
}

export function resolveTaskBoardDropInsertIndex({
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

function toSingleAnchorMoveInput({
  taskId,
  toStatus,
  beforeTaskId,
  afterTaskId,
}: Readonly<{
  taskId: string;
  toStatus: TaskStatus;
  beforeTaskId: string | null;
  afterTaskId: string | null;
}>): MoveTaskInput {
  if (beforeTaskId) {
    return { taskId, toStatus, beforeTaskId };
  }

  if (afterTaskId) {
    return { taskId, toStatus, afterTaskId };
  }

  return { taskId, toStatus };
}

export function resolveTaskBoardMoveInput({
  activeTaskId,
  overId,
  columns,
}: Readonly<{
  activeTaskId: string;
  overId: string;
  columns: ReadonlyArray<TaskBoardColumnResult>;
}>): MoveTaskInput | null {
  const activeTask = findTaskInBoardColumns(columns, activeTaskId);
  if (!activeTask || activeTask.id === overId) {
    return null;
  }

  const overColumnStatus =
    getTaskStatusFromBoardColumnDroppableId(overId) ??
    findTaskStatusInBoardColumns(columns, overId);
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
  const insertIndex = resolveTaskBoardDropInsertIndex({
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

  return toSingleAnchorMoveInput({
    taskId: activeTaskId,
    toStatus: overColumnStatus,
    beforeTaskId,
    afterTaskId,
  });
}

function resolveInsertIndex(
  tasks: ReadonlyArray<TaskView>,
  input: MoveTaskInput
): number {
  if (input.beforeTaskId) {
    const index = tasks.findIndex(task => task.id === input.beforeTaskId);
    return index === -1 ? tasks.length : index;
  }

  if (input.afterTaskId) {
    const index = tasks.findIndex(task => task.id === input.afterTaskId);
    return index === -1 ? tasks.length : index + 1;
  }

  return tasks.length;
}

export function applyTaskBoardMove(
  board: TaskBoardResult | undefined,
  input: MoveTaskInput
): TaskBoardResult | undefined {
  const movingTask = findTaskInBoard(board, input.taskId);
  if (!board || !movingTask) return board;

  const changedStatus = movingTask.status !== input.toStatus;

  return {
    ...board,
    columns: board.columns.map(column => {
      const withoutMovingTask = column.tasks.filter(
        task => task.id !== input.taskId
      );

      if (column.status !== input.toStatus) {
        return {
          ...column,
          tasks: withoutMovingTask,
          totalCount:
            changedStatus && column.status === movingTask.status
              ? Math.max(0, column.totalCount - 1)
              : column.totalCount,
        };
      }

      const nextTasks = [...withoutMovingTask];
      const insertIndex = resolveInsertIndex(nextTasks, input);
      nextTasks.splice(insertIndex, 0, {
        ...movingTask,
        status: input.toStatus,
      });

      return {
        ...column,
        tasks: nextTasks.map((task, index) => ({
          ...task,
          position: (index + 1) * 1024,
        })),
        totalCount:
          changedStatus && column.status !== movingTask.status
            ? column.totalCount + 1
            : column.totalCount,
      };
    }),
  };
}

export function applyTaskListMove(
  list: TaskListResult | undefined,
  input: MoveTaskInput
): TaskListResult | undefined {
  if (!list) return list;

  return {
    ...list,
    tasks: list.tasks
      .map(task =>
        task.id === input.taskId ? { ...task, status: input.toStatus } : task
      )
      .sort(compareTasksByBoardOrder),
  };
}
