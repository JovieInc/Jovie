import { z } from 'zod';

/**
 * Canonical action error/result envelope.
 *
 * Every action execution resolves to one `ActionResult`: either
 * `{ ok: true, data, meta }` or `{ ok: false, error, meta }`. Adapters
 * (HTTP route, JSON-RPC, NDJSON stream, App Intent) map this envelope to
 * their transport; they never invent their own error semantics.
 */

/** Error codes any action may raise. Domain codes are declared per action. */
export const COMMON_ERROR_CODES = [
  'UNAUTHENTICATED',
  'PROFILE_REQUIRED',
  'VALIDATION_FAILED',
  'ENTITLEMENT_DENIED',
  'QUOTA_EXCEEDED',
  'RATE_LIMITED',
  'FEATURE_DISABLED',
  'IDEMPOTENCY_CONFLICT',
  'INTERNAL_ERROR',
] as const;

export type CommonErrorCode = (typeof COMMON_ERROR_CODES)[number];

const SNAKE_UPPER = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

export function isErrorCodeFormat(code: string): boolean {
  return SNAKE_UPPER.test(code);
}

/** Canonical structured error. `code` is refined per action. */
export const actionErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean(),
  retryAfterSeconds: z.number().int().nonnegative().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type ActionError = z.infer<typeof actionErrorSchema>;

/** Execution metadata attached to every result, success or failure. */
export const actionResultMetaSchema = z.object({
  actionId: z.string().min(1),
  actionVersion: z.string().min(1),
  /** Present once the dispatcher ledger (later phase) assigns one. */
  executionId: z.uuid().optional(),
  idempotencyKey: z.string().min(1),
  /** True when the result was replayed from a prior idempotent execution. */
  replayed: z.boolean(),
});

export type ActionResultMeta = z.infer<typeof actionResultMetaSchema>;

/** Error schema whose `code` is pinned to one action's declared codes. */
export function actionErrorSchemaFor(codes: readonly [string, ...string[]]) {
  return actionErrorSchema.extend({ code: z.enum(codes) });
}

export function actionSuccessSchema<O extends z.ZodType>(output: O) {
  return z.object({
    ok: z.literal(true),
    data: output,
    meta: actionResultMetaSchema,
  });
}

export function actionFailureSchema<E extends z.ZodType>(error: E) {
  return z.object({
    ok: z.literal(false),
    error,
    meta: actionResultMetaSchema,
  });
}

/** Canonical discriminated result union for an action. */
export function actionResultSchema<O extends z.ZodType, E extends z.ZodType>(
  output: O,
  error: E
) {
  return z.discriminatedUnion('ok', [
    actionSuccessSchema(output),
    actionFailureSchema(error),
  ]);
}
