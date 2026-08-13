import { z } from 'zod';

import {
  actionErrorSchema,
  actionHandoffSchema,
  entityRefSchema,
} from './errors';

/**
 * Invocation envelope, result/receipt union, and capability resolution
 * shapes for the Canonical Actions platform.
 */

/** Channels an action may be exposed on. Exposure is opt-in per action. */
export const ACTION_CHANNELS = [
  'web',
  'ios',
  'electron',
  'app_intent',
  'widget',
  'cli',
  'mcp',
  'chat_tool',
  'extension',
] as const;

export type ActionChannel = (typeof ACTION_CHANNELS)[number];

export const actionChannelSchema = z.enum(ACTION_CHANNELS);

/**
 * Invocation context. `profileId` is requested scope, never trusted
 * identity — the server must prove ownership. `idempotencyKey` and
 * `clientVersion` live here, never inside domain input schemas.
 */
export const actionInvocationContextSchema = z.object({
  profileId: z.uuid(),
  channel: actionChannelSchema,
  clientVersion: z.string().min(1).max(64).optional(),
});

export type ActionInvocationContext = z.infer<
  typeof actionInvocationContextSchema
>;

/** Canonical invocation envelope for `POST /api/v1/actions/{id}/invoke`. */
export function actionInvocationSchema<I extends z.ZodType>(input: I) {
  return z.object({
    schemaVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(128),
    context: actionInvocationContextSchema,
    input,
    confirmationToken: z.string().min(1).optional(),
  });
}

export const ACTION_RESULT_STATUSES = [
  'completed',
  'handoff',
  'requires_input',
  'in_progress',
  'unavailable',
  'failed',
] as const;

export type ActionResultStatus = (typeof ACTION_RESULT_STATUSES)[number];

export const actionResultStatusSchema = z.enum(ACTION_RESULT_STATUSES);

/** Durable execution receipt. Recorded in the `action_executions` ledger. */
export const actionReceiptSchema = z.object({
  executionId: z.uuid(),
  requestId: z.string().min(1),
  actionId: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  channel: actionChannelSchema,
  status: actionResultStatusSchema,
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().optional(),
  entityRef: entityRefSchema.optional(),
});

export type ActionReceipt = z.infer<typeof actionReceiptSchema>;

/** Canonical result union. Every invocation resolves to exactly one. */
export function actionResultSchema<D extends z.ZodType>(data: D) {
  return z.discriminatedUnion('status', [
    z.object({
      status: z.literal('completed'),
      receipt: actionReceiptSchema,
      entityRef: entityRefSchema.optional(),
      data,
    }),
    z.object({
      status: z.literal('handoff'),
      receipt: actionReceiptSchema,
      handoff: actionHandoffSchema,
    }),
    z.object({
      status: z.literal('requires_input'),
      receipt: actionReceiptSchema,
      missingFields: z.array(z.string().min(1)).min(1),
    }),
    z.object({
      status: z.literal('in_progress'),
      receipt: actionReceiptSchema,
      retryAfterMs: z.number().int().nonnegative().optional(),
    }),
    z.object({
      status: z.literal('unavailable'),
      receipt: actionReceiptSchema,
      error: actionErrorSchema,
    }),
    z.object({
      status: z.literal('failed'),
      receipt: actionReceiptSchema,
      error: actionErrorSchema,
    }),
  ]);
}
