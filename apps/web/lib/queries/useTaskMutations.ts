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
  previousLists: ReadonlyArray<
    readonly [readonly unknown[], TaskListResult | undefined]
  >,
  previousDetails: ReadonlyArray<
    readonly [readonly unknown[], TaskView | undefined]
  >,
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

  return {
    ...stats,
    [previousStatusKey]: previousStatusCount,
    [nextStatusKey]: nextStatusCount,
    activeTodoCount:
      (previousStatusKey === 'backlog'
        ? previousStatusCount
        : nextStatusKey === 'backlog'
          ? nextStatusCount
          : stats.backlog) +
      (previousStatusKey === 'todo'
        ? previousStatusCount
        : nextStatusKey === 'todo'
          ? nextStatusCount
          : stats.todo) +
      (previousStatusKey === 'inProgress'
        ? previousStatusCount
        : nextStatusKey === 'inProgress'
          ? nextStatusCount
          : stats.inProgress),
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.releaseTasks.all,
      });
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

      const previousLists = queryClient.getQueriesData<TaskListResult>({
        queryKey: queryKeys.tasks.list(),
      });
      const previousDetails = queryClient.getQueriesData<TaskView>({
        queryKey: queryKeys.tasks.detail(taskId),
      });
      const previousStatsEntries = queryClient.getQueriesData<TaskStats>({
        queryKey: queryKeys.tasks.stats(),
      });
      const previousTask = getCachedTask(
        previousLists,
        previousDetails,
        taskId
      );
      const optimisticCompletedAt = getOptimisticCompletedAt(
        previousTask,
        data.status
      );

      for (const [queryKey, list] of previousLists) {
        queryClient.setQueryData(
          queryKey,
          updateTaskInList(list, taskId, {
            ...data,
            completedAt: optimisticCompletedAt,
          })
        );
      }

      for (const [queryKey, detail] of previousDetails) {
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
        for (const [queryKey, stats] of previousStatsEntries) {
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

      return { previousLists, previousDetails, previousStatsEntries };
    },
    onError: (_error, { taskId }, context) => {
      if (!context) {
        return;
      }

      for (const [queryKey, list] of context.previousLists) {
        queryClient.setQueryData(queryKey, list);
      }

      for (const [queryKey, detail] of context.previousDetails) {
        if (detail) {
          queryClient.setQueryData(queryKey, detail);
        }
      }

      for (const [queryKey, stats] of context.previousStatsEntries) {
        if (stats) {
          queryClient.setQueryData(queryKey, stats);
        }
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.releaseTasks.all,
      });
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.releaseTasks.all,
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

      const previousLists = queryClient.getQueriesData<TaskListResult>({
        queryKey: queryKeys.tasks.list(),
      });
      const previousDetails = queryClient.getQueriesData<TaskView>({
        queryKey: queryKeys.tasks.detail(taskId),
      });
      const previousStatsEntries = queryClient.getQueriesData<TaskStats>({
        queryKey: queryKeys.tasks.stats(),
      });
      const previousTask = getCachedTask(
        previousLists,
        previousDetails,
        taskId
      );

      for (const [queryKey, list] of previousLists) {
        if (!list) {
          continue;
        }

        queryClient.setQueryData(queryKey, {
          ...list,
          tasks: list.tasks.filter(task => task.id !== taskId),
        });
      }

      if (previousTask) {
        for (const [queryKey, stats] of previousStatsEntries) {
          if (!stats) {
            continue;
          }

          queryClient.setQueryData(
            queryKey,
            updateTaskStatsForDeletion(stats, previousTask.status)
          );
        }
      }

      return { previousLists, previousDetails, previousStatsEntries };
    },
    onError: (_error, taskId, context) => {
      if (!context) {
        return;
      }

      for (const [queryKey, list] of context.previousLists) {
        queryClient.setQueryData(queryKey, list);
      }

      for (const [queryKey, detail] of context.previousDetails) {
        if (detail) {
          queryClient.setQueryData(queryKey, detail);
        }
      }

      for (const [queryKey, stats] of context.previousStatsEntries) {
        if (stats) {
          queryClient.setQueryData(queryKey, stats);
        }
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.releaseTasks.all,
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.tasks.stats(),
      });
    },
  });
}
