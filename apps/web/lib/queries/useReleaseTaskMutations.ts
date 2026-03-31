'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  addReleaseTask,
  deleteReleaseTask,
  instantiateReleaseTasks,
  updateReleaseTask,
} from '@/app/app/(shell)/dashboard/releases/task-actions';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import { queryKeys } from './keys';

function getReleaseTasksQueryKey(releaseId: string) {
  return queryKeys.releaseTasks.byRelease(releaseId);
}

function restoreReleaseTasksSnapshot(
  queryClient: ReturnType<typeof useQueryClient>,
  releaseId: string,
  previous: ReleaseTaskView[] | undefined
) {
  if (previous) {
    queryClient.setQueryData(getReleaseTasksQueryKey(releaseId), previous);
  }
}

async function invalidateReleaseTaskQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  releaseId: string,
  options: Readonly<{ includeAllReleaseTasks?: boolean }> = {}
) {
  await queryClient.invalidateQueries({
    queryKey: getReleaseTasksQueryKey(releaseId),
  });

  if (options.includeAllReleaseTasks ?? true) {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.releaseTasks.all,
    });
  }

  await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
  await queryClient.invalidateQueries({
    queryKey: queryKeys.tasks.stats(),
  });
}

/**
 * Shared hook for optimistic task toggle (used by both compact and full row).
 */
export function useTaskToggleMutation(releaseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, done }: { taskId: string; done: boolean }) =>
      updateReleaseTask(taskId, {
        status: done ? 'done' : 'todo',
      }),

    onMutate: async ({ taskId, done }) => {
      await queryClient.cancelQueries({
        queryKey: getReleaseTasksQueryKey(releaseId),
      });

      const previous = queryClient.getQueryData<ReleaseTaskView[]>(
        getReleaseTasksQueryKey(releaseId)
      );

      if (previous) {
        queryClient.setQueryData(
          getReleaseTasksQueryKey(releaseId),
          previous.map(task =>
            task.id === taskId
              ? {
                  ...task,
                  status: done ? ('done' as const) : ('todo' as const),
                  completedAt: done ? new Date() : null,
                }
              : task
          )
        );
      }

      return { previous };
    },

    onError: (_err, _vars, context) => {
      restoreReleaseTasksSnapshot(queryClient, releaseId, context?.previous);
    },

    onSettled: async () => {
      await invalidateReleaseTaskQueries(queryClient, releaseId);
    },
  });
}

export function useInstantiateTasksMutation(releaseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => instantiateReleaseTasks(releaseId),

    onSettled: async () => {
      await invalidateReleaseTaskQueries(queryClient, releaseId);
    },
  });
}

export function useUpdateTaskMutation(releaseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      taskId,
      data,
    }: {
      taskId: string;
      data: Parameters<typeof updateReleaseTask>[1];
    }) => updateReleaseTask(taskId, data),

    onSettled: async () => {
      await invalidateReleaseTaskQueries(queryClient, releaseId, {
        includeAllReleaseTasks: false,
      });
    },
  });
}

export function useAddTaskMutation(releaseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Parameters<typeof addReleaseTask>[1]) =>
      addReleaseTask(releaseId, data),

    onSettled: async () => {
      await invalidateReleaseTaskQueries(queryClient, releaseId);
    },
  });
}

export function useDeleteTaskMutation(releaseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => deleteReleaseTask(taskId),

    onMutate: async taskId => {
      await queryClient.cancelQueries({
        queryKey: getReleaseTasksQueryKey(releaseId),
      });

      const previous = queryClient.getQueryData<ReleaseTaskView[]>(
        getReleaseTasksQueryKey(releaseId)
      );

      if (previous) {
        queryClient.setQueryData(
          getReleaseTasksQueryKey(releaseId),
          previous.filter(task => task.id !== taskId)
        );
      }

      return { previous };
    },

    onError: (_err, _taskId, context) => {
      restoreReleaseTasksSnapshot(queryClient, releaseId, context?.previous);
    },

    onSettled: async () => {
      await invalidateReleaseTaskQueries(queryClient, releaseId);
    },
  });
}
