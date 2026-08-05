import { tool } from 'ai';
import { z } from 'zod';
import {
  createTask,
  getTasks,
} from '@/app/app/(shell)/dashboard/tasks/task-actions';
import { APP_ROUTES } from '@/constants/routes';
import type { TaskView } from '@/lib/tasks/types';
import { chatToolSchema } from '../strict-schema';
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

/** The real paid-plan Tasks chat capability. */
export function createManageTasksTool(profileId: string | null) {
  return tool({
    description: TOOL_SCHEMAS.manageTasks.description,
    inputSchema: chatToolSchema({
      intent: z.enum(['create', 'list', 'open', 'release_plan']).optional(),
      title: z.string().max(200).optional(),
    }),
    execute: async ({ intent = 'open', title }) => {
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
        const result = await getTasks({ limit: 20 });
        return {
          success: true as const,
          intent,
          tasks: result.tasks.map(serializeTask),
          nextCursor: result.nextCursor,
          summary: `Found ${result.tasks.length} task${result.tasks.length === 1 ? '' : 's'}.`,
        };
      }

      const task = await createTask({
        title: title?.trim() || 'Untitled task',
        status: 'todo',
        priority: 'medium',
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
