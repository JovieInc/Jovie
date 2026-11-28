import { tool } from 'ai';
import { instantiateReleaseTasks } from '@/app/app/(shell)/dashboard/releases/task-actions';
import {
  createTask,
  getTask,
  getTasks,
  moveTask,
  updateTask,
} from '@/app/app/(shell)/dashboard/tasks/task-actions';
import { APP_ROUTES } from '@/constants/routes';
import { COPY_FALLBACKS } from '@/data/copyFallbacks';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import {
  TaskMutationAccessError,
  TaskMutationConflictError,
  TaskMutationValidationError,
} from '@/lib/tasks/errors';
import type { TaskView, UpdateTaskInput } from '@/lib/tasks/types';
import { TOOL_SCHEMAS } from '../tool-schemas';

function serializeTask(task: TaskView) {
  return {
    ...task,
    dueAt: task.dueAt?.toISOString() ?? null,
    scheduledFor: task.scheduledFor?.toISOString() ?? null,
    startedAt: task.startedAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

function serializeReleaseTask(task: ReleaseTaskView) {
  return {
    ...task,
    dueDate: task.dueDate?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

function missingTaskInput(missingFields: string[]) {
  return {
    success: false as const,
    errorCode: 'REQUIRES_INPUT' as const,
    error: 'Read the current task, then supply the required fields.',
    missingFields,
    retryable: false,
  };
}

/** The real paid-plan Tasks chat capability. */
export function createManageTasksTool(profileId: string | null) {
  return tool({
    description: TOOL_SCHEMAS.manageTasks.description,
    inputSchema: TOOL_SCHEMAS.manageTasks.inputSchema,
    execute: async ({
      intent = 'open',
      taskId,
      expectedMutationVersion,
      title,
      description,
      status,
      priority,
      assigneeKind,
      dueAt,
      beforeTaskId,
      afterTaskId,
      releaseId,
    }) => {
      if (!profileId) {
        return {
          success: false as const,
          error: 'Profile ID required',
          errorCode: 'PROFILE_REQUIRED' as const,
          retryable: true,
        };
      }

      if (intent === 'open') {
        return {
          success: true as const,
          intent,
          href: APP_ROUTES.TASKS,
          summary: 'Tasks workspace ready.',
        };
      }

      if (intent === 'list') {
        const result = await getTasks({
          limit: 20,
          ...(status ? { status } : {}),
          ...(releaseId ? { releaseId } : {}),
        });
        return {
          success: true as const,
          intent,
          tasks: result.tasks.map(serializeTask),
          nextCursor: result.nextCursor,
          summary: `Found ${result.tasks.length} task${result.tasks.length === 1 ? '' : 's'}.`,
        };
      }

      if (intent === 'get' || intent === 'update' || intent === 'move') {
        if (!taskId) return missingTaskInput(['taskId']);
        try {
          if (intent === 'get') {
            const task = await getTask(taskId);
            return {
              success: true as const,
              intent,
              task: serializeTask(task),
              href: APP_ROUTES.TASKS,
              summary: `Read task “${task.title}”.`,
            };
          }
          if (expectedMutationVersion === undefined) {
            return missingTaskInput(['expectedMutationVersion']);
          }
          if (intent === 'move') {
            if (!status) return missingTaskInput(['status']);
            const result = await moveTask({
              taskId,
              expectedMutationVersion,
              toStatus: status,
              ...(beforeTaskId !== undefined ? { beforeTaskId } : {}),
              ...(afterTaskId !== undefined ? { afterTaskId } : {}),
            });
            return {
              success: true as const,
              intent,
              taskId,
              affectedTasks: result.affectedTasks.map(serializeTask),
              href: APP_ROUTES.TASKS,
              summary: 'Task move saved.',
            };
          }

          // Only commitment fields are writable by this tool. Agent execution
          // status, outputs, actor identity and completion timestamps are not inputs.
          const patch: UpdateTaskInput = {
            ...(title !== undefined ? { title } : {}),
            ...(description !== undefined ? { description } : {}),
            ...(status !== undefined ? { status } : {}),
            ...(priority !== undefined ? { priority } : {}),
            ...(assigneeKind !== undefined ? { assigneeKind } : {}),
            ...(dueAt !== undefined
              ? { dueAt: dueAt === null ? null : new Date(dueAt) }
              : {}),
          };
          if (Object.keys(patch).length === 0) {
            return missingTaskInput([
              'title, description, status, priority, assigneeKind, or dueAt',
            ]);
          }
          const task = await updateTask(taskId, {
            ...patch,
            expectedMutationVersion,
          });
          return {
            success: true as const,
            intent,
            task: serializeTask(task),
            href: APP_ROUTES.TASKS,
            summary: `Updated task “${task.title}”.`,
          };
        } catch (error) {
          if (
            error instanceof TaskMutationConflictError ||
            error instanceof TaskMutationAccessError ||
            error instanceof TaskMutationValidationError
          ) {
            return {
              success: false as const,
              intent,
              taskId,
              errorCode: error.code,
              error: error.message,
              retryable: false,
            };
          }
          throw error;
        }
      }

      if (intent === 'release_plan') {
        if (!releaseId) {
          return {
            success: false as const,
            error: 'Release ID required to set up a release plan.',
            errorCode: 'RELEASE_ID_REQUIRED' as const,
            retryable: false,
          };
        }

        const tasks = await instantiateReleaseTasks(releaseId);
        return {
          success: true as const,
          intent,
          releaseId,
          tasks: tasks.map(serializeReleaseTask),
          href: APP_ROUTES.TASKS,
          summary: `Release plan ready with ${tasks.length} task${tasks.length === 1 ? '' : 's'}.`,
        };
      }

      const task = await createTask({
        title: title?.trim() || COPY_FALLBACKS.task,
        status: status ?? 'todo',
        priority: priority ?? 'medium',
        ...(description !== undefined ? { description } : {}),
        ...(assigneeKind !== undefined ? { assigneeKind } : {}),
        ...(releaseId !== undefined ? { releaseId } : {}),
        ...(dueAt !== undefined
          ? { dueAt: dueAt === null ? null : new Date(dueAt) }
          : {}),
      });

      return {
        success: true as const,
        intent,
        task: serializeTask(task),
        href: APP_ROUTES.TASKS,
        summary: `Created task “${task.title}”.`,
      };
    },
  });
}
