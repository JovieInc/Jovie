import { z } from 'zod';

import { actionErrorSchemaFor, COMMON_ERROR_CODES } from '../envelope';
import type { ActionDefinition } from '../metadata';
import {
  CANONICAL_AUTH,
  CANONICAL_EVOLUTION,
  CANONICAL_IDEMPOTENCY,
  isoDateSchema,
  mutationBaseSchema,
} from '../shared';

export const TASK_CREATE_DOMAIN_ERROR_CODES = [
  'TASKS_WORKSPACE_LOCKED',
  'RELEASE_NOT_FOUND',
] as const;

export const taskCreateInputSchema = mutationBaseSchema.extend({
  title: z.string().min(1).max(200),
  /** Attach the task to a release owned by the same profile. */
  releaseId: z.uuid().optional(),
  category: z.string().min(1).max(100).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  dueDate: isoDateSchema.optional(),
  assigneeKind: z.enum(['creator', 'jovie']).optional(),
});

export const taskCreateOutputSchema = z.object({
  taskId: z.uuid(),
  taskNumber: z.number().int().positive(),
  /** False when the idempotency key replayed an existing task. */
  created: z.boolean(),
});

const errorCodes = [...COMMON_ERROR_CODES, ...TASK_CREATE_DOMAIN_ERROR_CODES];

export const taskCreateErrorSchema = actionErrorSchemaFor(
  errorCodes as [string, ...string[]]
);

export type TaskCreateInput = z.infer<typeof taskCreateInputSchema>;
export type TaskCreateOutput = z.infer<typeof taskCreateOutputSchema>;

export const taskCreateAction: ActionDefinition<
  typeof taskCreateInputSchema,
  typeof taskCreateOutputSchema,
  typeof taskCreateErrorSchema
> = {
  id: 'task.create',
  version: '1',
  kind: 'mutation',
  discovery: {
    title: 'Create task',
    summary:
      'Create a workspace task, optionally attached to a release, on the authenticated creator profile.',
    category: 'tasks',
    bindings: [
      {
        kind: 'web-api',
        status: 'existing',
        note: 'Legacy paths: createTask, addReleaseTask, addCatalogTaskToRelease server actions and the manageTasks chat tool.',
      },
      {
        kind: 'chat-tool',
        status: 'contract-only',
      },
      {
        kind: 'swift',
        status: 'contract-only',
      },
      {
        kind: 'mcp',
        status: 'contract-only',
        note: 'Authenticated owner-workspace MCP only. The public per-artist MCP endpoint never accepts this action.',
      },
    ],
  },
  auth: CANONICAL_AUTH,
  idempotency: CANONICAL_IDEMPOTENCY,
  evolution: CANONICAL_EVOLUTION,
  domainErrorCodes: TASK_CREATE_DOMAIN_ERROR_CODES,
  entitlementKeys: ['canAccessTasksWorkspace'],
  input: taskCreateInputSchema,
  output: taskCreateOutputSchema,
  error: taskCreateErrorSchema,
};
