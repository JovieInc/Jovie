import { z } from 'zod';

/**
 * Canonical Actions stable error vocabulary.
 *
 * Every channel preserves these codes verbatim. MCP retains the code in
 * `error.data`, the CLI maps documented exit codes, native clients localize
 * presentation from `messageKey`. Adapters never flatten an error to an
 * untyped string and never invent codes.
 */
export const ACTION_ERROR_CODES = [
  'AUTH_REQUIRED',
  'PROFILE_REQUIRED',
  'FORBIDDEN',
  'ENTITLEMENT_REQUIRED',
  'ENTITLEMENT_UNVERIFIED',
  'QUOTA_EXHAUSTED',
  'FEATURE_DISABLED',
  'PROVIDER_UNAVAILABLE',
  'CLIENT_UPGRADE_REQUIRED',
  'VALIDATION_FAILED',
  'REQUIRES_INPUT',
  'CONFIRMATION_REQUIRED',
  'CONFLICT',
  'IN_PROGRESS',
  'RATE_LIMITED',
  'TEMPORARILY_UNAVAILABLE',
  'INTERNAL',
] as const;

export type ActionErrorCode = (typeof ACTION_ERROR_CODES)[number];

export const actionErrorCodeSchema = z.enum(ACTION_ERROR_CODES);

/** Reference to an entity affected by an action execution. */
export const entityRefSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.uuid(),
});

export type EntityRef = z.infer<typeof entityRefSchema>;

/**
 * Semantic handoff destination (e.g. `chat.new`). Adapters map the target
 * to `/app/chat`, a native tab, or a client link; the contract never
 * contains routes or URLs.
 */
export const actionHandoffSchema = z.object({
  target: z.string().min(1),
  labelKey: z.string().min(1).optional(),
});

export type ActionHandoff = z.infer<typeof actionHandoffSchema>;

/** Canonical structured error attached to failed/unavailable results. */
export const actionErrorSchema = z.object({
  code: actionErrorCodeSchema,
  /** Safe user-facing message key; resolved to copy by the client. */
  messageKey: z.string().min(1),
  retryable: z.boolean(),
  fieldIssues: z
    .array(
      z.object({
        path: z.string().min(1),
        messageKey: z.string().min(1),
      })
    )
    .optional(),
  upgrade: z
    .object({
      eligible: z.boolean(),
      routeRef: z.string().min(1).optional(),
    })
    .optional(),
  handoff: actionHandoffSchema.optional(),
});

export type ActionError = z.infer<typeof actionErrorSchema>;
