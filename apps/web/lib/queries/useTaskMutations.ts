'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  bulkUpdateTasks,
  createTask,
  deleteTask,
  updateTask,
} from '@/app/app/(shell)/dashboard/tasks/task-actions';
import type {
  CreateTaskInput,
  TaskListResult,
  TaskStats,
  TaskView,
  UpdateTaskInput,
} from '@/lib/tasks/types';
import { queryKeys } from './keys';

type TaskStatsStatusKey = Exclude<keyof TaskStats, 'activeTodoCount'>;
type TaskListCacheEntry = readonly [
  readonly unknown[],
  TaskListResult | undefined,
];
type TaskDetailCacheEntry = readonly [readonly unknown[], TaskView | undefined];
type TaskStatsCacheEntry = readonly [readonly unknown[], TaskStats | undefined];

interface TaskCacheSnapshot {
  readonly previousLists: TaskListCacheEntry[];
  readonly previousDetails: TaskDetailCacheEntry[];
  readonly previousStatsEntries: TaskStatsCacheEntry[];
}

function toTaskStatsStatusKey(status: TaskView['status']): TaskStatsStatusKey {
  return status === 'in_progress' ? 'inProgress' : status;
}

function updateTaskInList(
  list: TaskListResult | undefined,
  taskId: string,
  patch: Partial<TaskView>
): TaskListResult | undefined {
  if (!list) {
    return list;
  }

  return {
    ...list,
    tasks: list.tasks.map(task =>
      task.id === taskId ? { ...task, ...patch } : task
    ),
  };
}

function getCachedTask(
  previousLists: ReadonlyArray<TaskListCacheEntry>,
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

  return undefined;
}

function getTaskCacheSnapshot(
  queryClient: ReturnType<typeof useQueryClient>,
  taskId: string
): TaskCacheSnapshot {
  return {
    previousLists: queryClient.getQueriesData<TaskListResult>({
      queryKey: queryKeys.tasks.list(),
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
  queryClient: ReturnType<typeof useQueryClient>,
  snapshot: TaskCacheSnapshot
) {
  for (const [queryKey, list] of snapshot.previousLists) {
    queryClient.setQueryData(queryKey, list);
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
  queryClient: ReturnType<typeof useQueryClient>,
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
        snapshot.previousDetails,
        taskId
      );
      const optimisticCompletedAt = getOptimisticCompletedAt(
        previousTask,
        data.status
      );

      for (const [queryKey, list] of snapshot.previousLists) {
        queryClient.setQueryData(
          queryKey,
          updateTaskInList(list, taskId, {
            ...data,
            completedAt: optimisticCompletedAt,
          })
        );
      }

      for (const [queryKey, detail] of snapshot.previousDetails) {
        if (!detail) {
          continue;
        }

        queryClient.setQueryData(queryKey, {
          ...detail,
          ...data,
          completedAt:
            data.status === undefined
              ? detail.completedAt
              : optimisticCompletedAt,
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

export function useDeleteTaskMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => deleteTask(taskId),
    onMutate: async taskId => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all });

      const snapshot = getTaskCacheSnapshot(queryClient, taskId);
      const previousTask = getCachedTask(
        snapshot.previousLists,
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
