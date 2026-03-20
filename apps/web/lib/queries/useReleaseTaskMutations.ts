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
        queryKey: queryKeys.releaseTasks.byRelease(releaseId),
      });

      const previous = queryClient.getQueryData<ReleaseTaskView[]>(
        queryKeys.releaseTasks.byRelease(releaseId)
      );

      if (previous) {
        queryClient.setQueryData(
          queryKeys.releaseTasks.byRelease(releaseId),
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
      if (context?.previous) {
        queryClient.setQueryData(
          queryKeys.releaseTasks.byRelease(releaseId),
          context.previous
        );
      }
    },

    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.releaseTasks.byRelease(releaseId),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.releaseTasks.all,
      });
    },
  });
}

export function useInstantiateTasksMutation(releaseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => instantiateReleaseTasks(releaseId),

    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.releaseTasks.byRelease(releaseId),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.releaseTasks.all,
      });
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
      await queryClient.invalidateQueries({
        queryKey: queryKeys.releaseTasks.byRelease(releaseId),
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
      await queryClient.invalidateQueries({
        queryKey: queryKeys.releaseTasks.byRelease(releaseId),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.releaseTasks.all,
      });
    },
  });
}

export function useDeleteTaskMutation(releaseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => deleteReleaseTask(taskId),

    onMutate: async taskId => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.releaseTasks.byRelease(releaseId),
      });

      const previous = queryClient.getQueryData<ReleaseTaskView[]>(
        queryKeys.releaseTasks.byRelease(releaseId)
      );

      if (previous) {
        queryClient.setQueryData(
          queryKeys.releaseTasks.byRelease(releaseId),
          previous.filter(task => task.id !== taskId)
        );
      }

      return { previous };
    },

    onError: (_err, _taskId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          queryKeys.releaseTasks.byRelease(releaseId),
          context.previous
        );
      }
    },

    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.releaseTasks.byRelease(releaseId),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.releaseTasks.all,
      });
    },
  });
}
