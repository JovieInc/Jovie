'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  bulkUpdateTasks,
  createTask,
  deleteTask,
  moveTask,
  updateTask,
} from '@/app/app/(shell)/dashboard/tasks/task-actions';
import {
  applyTaskBoardMove,
  applyTaskListMove,
  compareTasksByBoardOrder,
} from '@/lib/tasks/task-board';
import type {
  CreateTaskInput,
  MoveTaskInput,
  TaskBoardResult,
  TaskListResult,
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
type TaskQueryClient = ReturnType<typeof useQueryClient>;

interface TaskCacheSnapshot {
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
    tasks: options.sort ? tasks.sort(compareTasksByBoardOrder) : tasks,
  };
}

function updateTaskInBoard(
  board: TaskBoardResult | undefined,
  taskId: string,
  patch: Partial<TaskView>
): TaskBoardResult | undefined {
  if (!board) {
    return board;
  }

  return {
    ...board,
    columns: board.columns.map(column => ({
      ...column,
      tasks: column.tasks.map(task =>
        task.id === taskId ? { ...task, ...patch } : task
      ),
    })),
  };
}

function getCachedTask(
  previousLists: ReadonlyArray<TaskListCacheEntry>,
  previousBoards: ReadonlyArray<TaskBoardCacheEntry>,
  previousDetails: ReadonlyArray<TaskDetailCacheEntry>,
  taskId: string
): TaskView | undefined {
  for (const [, detail] of previousDetails) {
    if (detail) {
      return detail;
    }
  }

  for (const [, list] of previousLists) {
    const task = list?.tasks.find(candidate => candidate.id === taskId);
    if (task) {
      return task;
    }
  }

  for (const [, board] of previousBoards) {
    for (const column of board?.columns ?? []) {
      const task = column.tasks.find(candidate => candidate.id === taskId);
      if (task) {
        return task;
      }
    }
  }

  return undefined;
}

function getTaskCacheSnapshot(
  queryClient: TaskQueryClient,
  taskId: string
): TaskCacheSnapshot {
  return {
    previousLists: queryClient.getQueriesData<TaskListResult>({
      queryKey: queryKeys.tasks.list(),
    }),
    previousBoards: queryClient.getQueriesData<TaskBoardResult>({
      queryKey: queryKeys.tasks.board(),
    }),
    previousDetails: queryClient.getQueriesData<TaskView>({
      queryKey: queryKeys.tasks.detail(taskId),
    }),
    previousStatsEntries: queryClient.getQueriesData<TaskStats>({
      queryKey: queryKeys.tasks.stats(),
    }),
  };
}

function restoreTaskCacheSnapshot(
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

async function invalidateTaskQueries(
  queryClient: TaskQueryClient,
  options: Readonly<{ includeStats?: boolean }> = {}
) {
  await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
  await queryClient.invalidateQueries({
    queryKey: queryKeys.releaseTasks.all,
  });

  if (options.includeStats) {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.tasks.stats(),
    });
  }
}

function getOptimisticCompletedAt(
  task: TaskView | undefined,
  nextStatus: TaskView['status'] | undefined
): Date | null | undefined {
  if (!nextStatus) {
    return undefined;
  }

  return nextStatus === 'done' ? (task?.completedAt ?? new Date()) : null;
}

function updateTaskStatsForStatusChange(
  stats: TaskStats,
  previousStatus: TaskView['status'],
  nextStatus: TaskView['status']
): TaskStats {
  const previousStatusKey = toTaskStatsStatusKey(previousStatus);
  const nextStatusKey = toTaskStatsStatusKey(nextStatus);

  const previousStatusCount = Math.max(0, stats[previousStatusKey] - 1);
  const nextStatusCount =
    previousStatusKey === nextStatusKey
      ? previousStatusCount + 1
      : stats[nextStatusKey] + 1;

  const resolveCount = (key: keyof TaskStats): number => {
    if (previousStatusKey === key) return previousStatusCount;
    if (nextStatusKey === key) return nextStatusCount;
    return stats[key];
  };

  return {
    ...stats,
    [previousStatusKey]: previousStatusCount,
    [nextStatusKey]: nextStatusCount,
    activeTodoCount:
      resolveCount('backlog') +
      resolveCount('todo') +
      resolveCount('inProgress'),
  };
}

function updateTaskStatsForDeletion(
  stats: TaskStats,
  previousStatus: TaskView['status']
): TaskStats {
  const previousStatusKey = toTaskStatsStatusKey(previousStatus);
  const previousStatusCount = Math.max(0, stats[previousStatusKey] - 1);

  return {
    ...stats,
    [previousStatusKey]: previousStatusCount,
    activeTodoCount:
      (previousStatusKey === 'backlog' ? previousStatusCount : stats.backlog) +
      (previousStatusKey === 'todo' ? previousStatusCount : stats.todo) +
      (previousStatusKey === 'inProgress'
        ? previousStatusCount
        : stats.inProgress),
  };
}

function patchMovedTaskBoards(
  queryClient: TaskQueryClient,
  previousBoards: ReadonlyArray<TaskBoardCacheEntry>,
  input: MoveTaskInput
) {
  for (const [queryKey, board] of previousBoards) {
    queryClient.setQueryData(queryKey, applyTaskBoardMove(board, input));
  }
}

function patchMovedTaskLists(
  queryClient: TaskQueryClient,
  previousLists: ReadonlyArray<TaskListCacheEntry>,
  input: MoveTaskInput
) {
  for (const [queryKey, list] of previousLists) {
    queryClient.setQueryData(queryKey, applyTaskListMove(list, input));
  }
}

function getOptimisticMoveCompletedAt(
  detail: TaskView,
  nextStatus: TaskView['status']
): Date | null {
  if (nextStatus === 'done') {
    return detail.completedAt ?? new Date();
  }

  return nextStatus !== detail.status ? null : detail.completedAt;
}

function patchMovedTaskDetails(
  queryClient: TaskQueryClient,
  previousDetails: ReadonlyArray<TaskDetailCacheEntry>,
  input: MoveTaskInput
) {
  for (const [queryKey, detail] of previousDetails) {
    if (!detail) {
      continue;
    }

    queryClient.setQueryData(queryKey, {
      ...detail,
      status: input.toStatus,
      completedAt: getOptimisticMoveCompletedAt(detail, input.toStatus),
    });
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
    if (!stats) {
      continue;
    }

    queryClient.setQueryData(
      queryKey,
      updateTaskStatsForStatusChange(stats, previousTask.status, nextStatus)
    );
  }
}

export function useCreateTaskMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTaskInput) => createTask(data),
    onSuccess: async () => {
      await invalidateTaskQueries(queryClient);
    },
  });
}

export function useUpdateTaskMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      taskId,
      data,
    }: {
      readonly taskId: string;
      readonly data: UpdateTaskInput;
    }) => updateTask(taskId, data),
    onMutate: async ({ taskId, data }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all });

      const snapshot = getTaskCacheSnapshot(queryClient, taskId);
      const previousTask = getCachedTask(
        snapshot.previousLists,
        snapshot.previousBoards,
        snapshot.previousDetails,
        taskId
      );
      const optimisticCompletedAt =
        data.completedAt === undefined
          ? getOptimisticCompletedAt(previousTask, data.status)
          : data.completedAt;
      const optimisticPatch: Partial<TaskView> = {
        ...data,
        ...(optimisticCompletedAt === undefined
          ? {}
          : { completedAt: optimisticCompletedAt }),
      };

      for (const [queryKey, list] of snapshot.previousLists) {
        queryClient.setQueryData(
          queryKey,
          updateTaskInList(list, taskId, optimisticPatch, {
            sort: data.status !== undefined,
          })
        );
      }

      for (const [queryKey, board] of snapshot.previousBoards) {
        const boardWithStatusUpdate = data.status
          ? applyTaskBoardMove(board, {
              taskId,
              toStatus: data.status,
            })
          : board;

        queryClient.setQueryData(
          queryKey,
          updateTaskInBoard(boardWithStatusUpdate, taskId, optimisticPatch)
        );
      }

      for (const [queryKey, detail] of snapshot.previousDetails) {
        if (!detail) {
          continue;
        }

        queryClient.setQueryData(queryKey, {
          ...detail,
          ...optimisticPatch,
        });
      }

      if (previousTask && data.status) {
        for (const [queryKey, stats] of snapshot.previousStatsEntries) {
          if (!stats) {
            continue;
          }

          queryClient.setQueryData(
            queryKey,
            updateTaskStatsForStatusChange(
              stats,
              previousTask.status,
              data.status
            )
          );
        }
      }

      return snapshot;
    },
    onError: (_error, { taskId }, context) => {
      if (!context) {
        return;
      }

      restoreTaskCacheSnapshot(queryClient, context);
    },
    onSettled: async () => {
      await invalidateTaskQueries(queryClient);
    },
  });
}

export function useBulkUpdateTasksMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      taskIds,
      data,
    }: {
      readonly taskIds: string[];
      readonly data: UpdateTaskInput;
    }) => bulkUpdateTasks(taskIds, data),
    onSuccess: async () => {
      await invalidateTaskQueries(queryClient);
    },
  });
}

export function useMoveTaskMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: MoveTaskInput) => moveTask(input),
    onMutate: async input => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all });

      const snapshot = getTaskCacheSnapshot(queryClient, input.taskId);
      const previousTask = getCachedTask(
        snapshot.previousLists,
        snapshot.previousBoards,
        snapshot.previousDetails,
        input.taskId
      );

      patchMovedTaskBoards(queryClient, snapshot.previousBoards, input);
      patchMovedTaskLists(queryClient, snapshot.previousLists, input);
      patchMovedTaskDetails(queryClient, snapshot.previousDetails, input);
      patchMovedTaskStatsIfNeeded(
        queryClient,
        snapshot.previousStatsEntries,
        previousTask,
        input.toStatus
      );

      return snapshot;
    },
    onError: (_error, _input, context) => {
      if (!context) {
        return;
      }

      restoreTaskCacheSnapshot(queryClient, context);
    },
    onSettled: async () => {
      await invalidateTaskQueries(queryClient, {
        includeStats: true,
      });
    },
  });
}

export function useDeleteTaskMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => deleteTask(taskId),
    onMutate: async taskId => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all });

      const snapshot = getTaskCacheSnapshot(queryClient, taskId);
      const previousTask = getCachedTask(
        snapshot.previousLists,
        snapshot.previousBoards,
        snapshot.previousDetails,
        taskId
      );

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
          if (!stats) {
            continue;
          }

          queryClient.setQueryData(
            queryKey,
            updateTaskStatsForDeletion(stats, previousTask.status)
          );
        }
      }

      return snapshot;
    },
    onError: (_error, taskId, context) => {
      if (!context) {
        return;
      }

      restoreTaskCacheSnapshot(queryClient, context);
    },
    onSettled: async () => {
      await invalidateTaskQueries(queryClient, { includeStats: true });
    },
  });
}
