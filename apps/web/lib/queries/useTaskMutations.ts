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
        queryKey: queryKeys.tasks.all,
      });
      const previousDetail = queryClient.getQueryData<TaskView>(
        queryKeys.tasks.detail(taskId)
      );
      const previousStats = queryClient.getQueryData<TaskStats>(
        queryKeys.tasks.stats()
      );

      for (const [queryKey, list] of previousLists) {
        queryClient.setQueryData(
          queryKey,
          updateTaskInList(list, taskId, {
            ...data,
            completedAt:
              data.status === 'done'
                ? (previousDetail?.completedAt ?? new Date())
                : data.status
                  ? null
                  : undefined,
          })
        );
      }

      if (previousDetail) {
        queryClient.setQueryData(queryKeys.tasks.detail(taskId), {
          ...previousDetail,
          ...data,
          completedAt:
            data.status === 'done'
              ? (previousDetail.completedAt ?? new Date())
              : data.status
                ? null
                : previousDetail.completedAt,
        });
      }

      if (previousStats && previousDetail && data.status) {
        const previousStatusKey = toTaskStatsStatusKey(previousDetail.status);
        const nextStatusKey = toTaskStatsStatusKey(data.status);

        const previousStatusCount = Math.max(
          0,
          previousStats[previousStatusKey] - 1
        );
        const nextStatusCount =
          previousStatusKey === nextStatusKey
            ? previousStatusCount + 1
            : previousStats[nextStatusKey] + 1;

        const nextStats: TaskStats = {
          ...previousStats,
          [previousStatusKey]: previousStatusCount,
          [nextStatusKey]: nextStatusCount,
          activeTodoCount:
            (previousStatusKey === 'backlog'
              ? previousStatusCount
              : nextStatusKey === 'backlog'
                ? nextStatusCount
                : previousStats.backlog) +
            (previousStatusKey === 'todo'
              ? previousStatusCount
              : nextStatusKey === 'todo'
                ? nextStatusCount
                : previousStats.todo) +
            (previousStatusKey === 'inProgress'
              ? previousStatusCount
              : nextStatusKey === 'inProgress'
                ? nextStatusCount
                : previousStats.inProgress),
        };

        queryClient.setQueryData(queryKeys.tasks.stats(), nextStats);
      }

      return { previousLists, previousDetail, previousStats };
    },
    onError: (_error, { taskId }, context) => {
      if (!context) {
        return;
      }

      for (const [queryKey, list] of context.previousLists) {
        queryClient.setQueryData(queryKey, list);
      }

      if (context.previousDetail) {
        queryClient.setQueryData(
          queryKeys.tasks.detail(taskId),
          context.previousDetail
        );
      }

      if (context.previousStats) {
        queryClient.setQueryData(
          queryKeys.tasks.stats(),
          context.previousStats
        );
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
        queryKey: queryKeys.tasks.all,
      });
      const previousDetail = queryClient.getQueryData<TaskView>(
        queryKeys.tasks.detail(taskId)
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

      return { previousLists, previousDetail };
    },
    onError: (_error, taskId, context) => {
      if (!context) {
        return;
      }

      for (const [queryKey, list] of context.previousLists) {
        queryClient.setQueryData(queryKey, list);
      }

      if (context.previousDetail) {
        queryClient.setQueryData(
          queryKeys.tasks.detail(taskId),
          context.previousDetail
        );
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
