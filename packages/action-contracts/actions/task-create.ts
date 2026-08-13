import { z } from 'zod';

import type { ActionDescriptor } from '../descriptor';

/**
 * `task.create` — create an internal task.
 *
 * Internal write on the authenticated creator profile. Enforces Tasks
 * workspace access and release ownership at invoke time; users without
 * access receive a truthful structured `unavailable` result with an
 * entitlement reason and upgrade handoff, never a silent no-op.
 */

/** Mirrors the domain task status enum. */
export const TASK_STATUSES = [
  'backlog',
  'todo',
  'in_progress',
  'done',
  'cancelled',
] as const;

/** Mirrors the domain task priority enum. */
export const TASK_PRIORITIES = [
  'urgent',
  'high',
  'medium',
  'low',
  'none',
] as const;

/** Mirrors the domain task assignee-kind enum. */
export const TASK_ASSIGNEE_KINDS = ['human', 'jovie'] as const;

export const taskCreateInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assigneeKind: z.enum(TASK_ASSIGNEE_KINDS).optional(),
  /** Mirrors canonical `CreateTaskInput.assigneeUserId` (an app user id). */
  assigneeUserId: z.uuid().nullish(),
  /** Attach to a release owned by the same profile. */
  releaseId: z.uuid().optional(),
  parentTaskId: z.uuid().optional(),
  /** Canonical `CreateTaskInput` date fields; ISO datetimes on the wire. */
  dueAt: z.iso.datetime().nullish(),
  scheduledFor: z.iso.datetime().nullish(),
  startedAt: z.iso.datetime().nullish(),
  completedAt: z.iso.datetime().nullish(),
  category: z.string().trim().min(1).max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const taskCreateOutputSchema = z.object({
  taskId: z.uuid(),
  taskNumber: z.number().int().positive(),
  title: z.string().min(1),
});

export type TaskCreateInput = z.infer<typeof taskCreateInputSchema>;
export type TaskCreateOutput = z.infer<typeof taskCreateOutputSchema>;

export const taskCreateAction: ActionDescriptor<
  typeof taskCreateInputSchema,
  typeof taskCreateOutputSchema
> = {
  id: 'task.create',
  schemaVersion: 1,
  titleKey: 'actions.task.create.title',
  descriptionKey: 'actions.task.create.description',
  effect: 'internal_write',
  confirmation: 'none',
  supportedChannels: ['web', 'ios', 'app_intent', 'chat_tool', 'mcp', 'cli'],
  requirements: [
    { type: 'auth' },
    { type: 'profile_ownership' },
    { type: 'entitlement', key: 'canAccessTasksWorkspace' },
  ],
  inputSchema: taskCreateInputSchema,
  outputSchema: taskCreateOutputSchema,
};
