import type { QueryClient } from '@tanstack/react-query';
import {
  applyTaskBoardMove,
  applyTaskListMove,
  compareTasksByBoardOrder,
} from '@/lib/tasks/task-board';
import type {
  MoveTaskInput,
  TaskBoardResult,
  TaskListResult,
  TaskMutationSnapshot,
  TaskStats,
  TaskView,
  UpdateTaskInput,
} from '@/lib/tasks/types';
import { queryKeys } from './keys';

type TaskStatsStatusKey = Exclude<
  keyof TaskStats,
  'activeTodoCount' | 'newActiveTodoCount'
>;
type TaskListCacheEntry = readonly [
  readonly unknown[],
  TaskListResult | undefined,
];
type TaskBoardCacheEntry = readonly [
  readonly unknown[],
  TaskBoardResult | undefined,
];
type TaskDetailCacheEntry = readonly [readonly unknown[], TaskView | undefined];
type TaskStatsCacheEntry = readonly [readonly unknown[], TaskStats | undefined];
type TaskQueryClient = QueryClient;

export interface TaskCacheSnapshot {
  readonly previousLists: TaskListCacheEntry[];
  readonly previousBoards: TaskBoardCacheEntry[];
  readonly previousDetails: TaskDetailCacheEntry[];
  readonly previousStatsEntries: TaskStatsCacheEntry[];
}

function toTaskStatsStatusKey(status: TaskView['status']): TaskStatsStatusKey {
  return status === 'in_progress' ? 'inProgress' : status;
}

function updateTaskInList(
  list: TaskListResult | undefined,
  taskId: string,
  patch: Partial<TaskView>,
  options: Readonly<{ sort?: boolean }> = {}
): TaskListResult | undefined {
  if (!list) {
    return list;
  }

  const tasks = list.tasks.map(task =>
    task.id === taskId ? { ...task, ...patch } : task
  );

  return {
    ...list,
    tasks: options.sort ? tasks.toSorted(compareTasksByBoardOrder) : tasks,
  };
}

function updateTaskInBoard(
  board: TaskBoardResult | undefined,
  taskId: string,
  patch: Partial<TaskView>
): TaskBoardResult | undefined {
  const task = board?.columns
    .flatMap(column => column.tasks)
    .find(row => row.id === taskId);
  if (!board || !task) return board;
  const saved = { ...task, ...patch };
  return {
    ...board,
    columns: board.columns.map(column => {
      const containedTask = column.tasks.some(row => row.id === taskId);
      const containsTask = column.status === saved.status;
      const rows = column.tasks.filter(row => row.id !== taskId);
      if (containsTask) rows.push(saved);
      return {
        ...column,
        tasks: rows.toSorted(compareTasksByBoardOrder),
        totalCount: Math.max(
          0,
          column.totalCount + Number(containsTask) - Number(containedTask)
        ),
      };
    }),
  };
}

export function getCachedTasks(snapshot: TaskCacheSnapshot): TaskView[] {
  const rows = [
    ...snapshot.previousDetails.flatMap(([, detail]) =>
      detail ? [detail] : []
    ),
    ...snapshot.previousLists.flatMap(([, list]) => list?.tasks ?? []),
    ...snapshot.previousBoards.flatMap(
      ([, board]) => board?.columns.flatMap(column => column.tasks) ?? []
    ),
  ];
  const tasks = new Map<string, TaskView>();
  for (const task of rows) {
    const previous = tasks.get(task.id);
    if (
      !previous ||
      (task.mutationVersion ?? 0) > (previous.mutationVersion ?? 0)
    ) {
      tasks.set(task.id, task);
    }
  }
  return [...tasks.values()];
}

export function getCachedTaskFromSnapshot(
  snapshot: TaskCacheSnapshot,
  taskId: string
): TaskView | undefined {
  return getCachedTasks(snapshot).find(task => task.id === taskId);
}

export function getTaskCacheSnapshot(
  queryClient: TaskQueryClient
): TaskCacheSnapshot {
  return {
    previousLists: queryClient.getQueriesData<TaskListResult>({
      queryKey: queryKeys.tasks.list(),
    }),
    previousBoards: queryClient.getQueriesData<TaskBoardResult>({
      queryKey: queryKeys.tasks.board(),
    }),
    previousDetails: queryClient.getQueriesData<TaskView>({
      queryKey: queryKeys.tasks.all,
      predicate: query => query.queryKey[1] === 'detail',
    }),
    previousStatsEntries: queryClient.getQueriesData<TaskStats>({
      queryKey: queryKeys.tasks.stats(),
    }),
  };
}

export function restoreTaskCacheSnapshot(
  queryClient: TaskQueryClient,
  snapshot: TaskCacheSnapshot
) {
  for (const [queryKey, list] of snapshot.previousLists) {
    queryClient.setQueryData(queryKey, list);
  }

  for (const [queryKey, board] of snapshot.previousBoards) {
    queryClient.setQueryData(queryKey, board);
  }

  for (const [queryKey, detail] of snapshot.previousDetails) {
    if (detail) {
      queryClient.setQueryData(queryKey, detail);
    }
  }

  for (const [queryKey, stats] of snapshot.previousStatsEntries) {
    if (stats) {
      queryClient.setQueryData(queryKey, stats);
    }
  }
}

function patchTaskCaches(
  queryClient: TaskQueryClient,
  taskId: string,
  patch: Partial<TaskView>
): void {
  const snapshot = getTaskCacheSnapshot(queryClient);
  const previous = getCachedTaskFromSnapshot(snapshot, taskId);
  for (const [key, list] of snapshot.previousLists) {
    queryClient.setQueryData(
      key,
      updateTaskInList(list, taskId, patch, {
        sort: patch.status !== undefined || patch.position !== undefined,
      })
    );
  }
  for (const [key, board] of snapshot.previousBoards) {
    queryClient.setQueryData(key, updateTaskInBoard(board, taskId, patch));
  }
  for (const [key, detail] of snapshot.previousDetails) {
    if (detail?.id === taskId)
      queryClient.setQueryData(key, { ...detail, ...patch });
  }
  if (patch.status)
    patchMovedTaskStatsIfNeeded(
      queryClient,
      snapshot.previousStatsEntries,
      previous,
      patch.status
    );
}

export function applySavedTask(
  queryClient: TaskQueryClient,
  saved: TaskMutationSnapshot | TaskView
): void {
  const previous = getCachedTaskFromSnapshot(
    getTaskCacheSnapshot(queryClient),
    saved.id
  );
  if ((previous?.mutationVersion ?? 0) > (saved.mutationVersion ?? 0)) return;
  patchTaskCaches(queryClient, saved.id, saved);
}

function getOptimisticCompletedAt(
  task: TaskView | undefined,
  nextStatus: TaskView['status'] | undefined,
  now: Date
): Date | null | undefined {
  if (!nextStatus) {
    return undefined;
  }

  return nextStatus === 'done' ? (task?.completedAt ?? now) : null;
}

function updateTaskStatsForStatusChange(
  stats: TaskStats,
  previousStatus: TaskView['status'],
  nextStatus: TaskView['status']
): TaskStats {
  if (previousStatus === nextStatus) return stats;
  const previousStatusKey = toTaskStatsStatusKey(previousStatus);
  const nextStatusKey = toTaskStatsStatusKey(nextStatus);

  const nextStats = {
    ...stats,
    [previousStatusKey]: Math.max(0, stats[previousStatusKey] - 1),
    [nextStatusKey]: stats[nextStatusKey] + 1,
  };

  return {
    ...nextStats,
    activeTodoCount: nextStats.backlog + nextStats.todo + nextStats.inProgress,
  };
}

function updateTaskStatsForDeletion(
  stats: TaskStats,
  previousStatus: TaskView['status']
): TaskStats {
  const previousStatusKey = toTaskStatsStatusKey(previousStatus);
  const nextStats = {
    ...stats,
    [previousStatusKey]: Math.max(0, stats[previousStatusKey] - 1),
  };

  return {
    ...nextStats,
    activeTodoCount: nextStats.backlog + nextStats.todo + nextStats.inProgress,
  };
}

function patchMovedTaskBoards(
  queryClient: TaskQueryClient,
  previousBoards: ReadonlyArray<TaskBoardCacheEntry>,
  input: MoveTaskInput,
  completedAt: Date | null
) {
  for (const [queryKey, board] of previousBoards) {
    queryClient.setQueryData(
      queryKey,
      updateTaskInBoard(applyTaskBoardMove(board, input), input.taskId, {
        completedAt,
      })
    );
  }
}

function patchMovedTaskLists(
  queryClient: TaskQueryClient,
  previousLists: ReadonlyArray<TaskListCacheEntry>,
  input: MoveTaskInput,
  completedAt: Date | null
) {
  for (const [queryKey, list] of previousLists) {
    queryClient.setQueryData(
      queryKey,
      updateTaskInList(applyTaskListMove(list, input), input.taskId, {
        completedAt,
      })
    );
  }
}

function patchMovedTaskStatsIfNeeded(
  queryClient: TaskQueryClient,
  previousStatsEntries: ReadonlyArray<TaskStatsCacheEntry>,
  previousTask: TaskView | undefined,
  nextStatus: TaskView['status']
) {
  if (!previousTask || previousTask.status === nextStatus) {
    return;
  }

  for (const [queryKey, stats] of previousStatsEntries) {
    if (
      !stats ||
      (queryKey[2] !== undefined &&
        queryKey[2] !== previousTask.creatorProfileId)
    ) {
      continue;
    }

    queryClient.setQueryData(
      queryKey,
      updateTaskStatsForStatusChange(stats, previousTask.status, nextStatus)
    );
  }
}

export function optimisticallyUpdateTask(
  queryClient: TaskQueryClient,
  taskId: string,
  data: UpdateTaskInput,
  now: Date
): void {
  const snapshot = getTaskCacheSnapshot(queryClient);
  const previousTask = getCachedTaskFromSnapshot(snapshot, taskId);
  const optimisticCompletedAt =
    data.completedAt === undefined
      ? getOptimisticCompletedAt(previousTask, data.status, now)
      : data.completedAt;
  const {
    descriptionContent: _descriptionContent,
    expectedMutationVersion: _expectedMutationVersion,
    ...optimisticData
  } = data;
  const optimisticPatch: Partial<TaskView> = {
    ...optimisticData,
    ...(optimisticCompletedAt === undefined
      ? {}
      : { completedAt: optimisticCompletedAt }),
  };

  patchTaskCaches(queryClient, taskId, optimisticPatch);
}

export function optimisticallyDeleteTask(
  queryClient: TaskQueryClient,
  taskId: string
): void {
  const snapshot = getTaskCacheSnapshot(queryClient);
  const previousTask = getCachedTaskFromSnapshot(snapshot, taskId);

  for (const [queryKey, list] of snapshot.previousLists) {
    if (!list) {
      continue;
    }

    queryClient.setQueryData(queryKey, {
      ...list,
      tasks: list.tasks.filter(task => task.id !== taskId),
    });
  }

  for (const [queryKey, board] of snapshot.previousBoards) {
    if (!board) {
      continue;
    }

    const removedFromBoard = board.columns.some(column =>
      column.tasks.some(task => task.id === taskId)
    );

    queryClient.setQueryData(queryKey, {
      ...board,
      columns: board.columns.map(column => {
        const removed = column.tasks.some(task => task.id === taskId);
        return {
          ...column,
          tasks: column.tasks.filter(task => task.id !== taskId),
          totalCount: removed
            ? Math.max(0, column.totalCount - 1)
            : column.totalCount,
        };
      }),
      totalCount: removedFromBoard
        ? Math.max(0, board.totalCount - 1)
        : board.totalCount,
    });
  }

  if (previousTask) {
    for (const [queryKey, stats] of snapshot.previousStatsEntries) {
      if (
        !stats ||
        (queryKey[2] !== undefined &&
          queryKey[2] !== previousTask.creatorProfileId)
      ) {
        continue;
      }

      queryClient.setQueryData(
        queryKey,
        updateTaskStatsForDeletion(stats, previousTask.status)
      );
    }
  }
}

export function optimisticallyMoveTask(
  queryClient: TaskQueryClient,
  input: MoveTaskInput,
  now: Date
): void {
  const snapshot = getTaskCacheSnapshot(queryClient);
  const previous = getCachedTaskFromSnapshot(snapshot, input.taskId);
  const completedAt =
    getOptimisticCompletedAt(previous, input.toStatus, now) ?? null;
  patchMovedTaskBoards(
    queryClient,
    snapshot.previousBoards,
    input,
    completedAt
  );
  patchMovedTaskLists(queryClient, snapshot.previousLists, input, completedAt);
  for (const [key, detail] of snapshot.previousDetails) {
    if (detail?.id === input.taskId)
      queryClient.setQueryData(key, {
        ...detail,
        status: input.toStatus,
        completedAt,
      });
  }
  patchMovedTaskStatsIfNeeded(
    queryClient,
    snapshot.previousStatsEntries,
    previous,
    input.toStatus
  );
}
