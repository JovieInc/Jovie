import { z } from 'zod';

import { actionErrorCodeSchema } from './errors';
import type { ActionId } from './ids';
import { type ActionChannel, actionChannelSchema } from './invocation';

/**
 * Canonical action descriptor (founder-approved contract).
 *
 * The descriptor is runtime-neutral wire data: stable identity, schema
 * version, product vocabulary keys, declared effect, confirmation policy,
 * allowed channels, and requirements. It never contains React nodes, icons,
 * callbacks, localized prose, routes, or client-trusted plan booleans.
 */

export const ACTION_EFFECTS = [
  'navigation',
  'internal_write',
  'external_write',
  'destructive',
] as const;

export type ActionEffect = (typeof ACTION_EFFECTS)[number];

export const ACTION_CONFIRMATIONS = ['none', 'required'] as const;

export type ActionConfirmation = (typeof ACTION_CONFIRMATIONS)[number];

/**
 * What the capability resolver must verify before an action is available.
 * `entitlement` keys reference canonical entitlement registry keys; the
 * contract declares them by name only and never evaluates them.
 */
export const actionRequirementSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('auth') }),
  z.object({ type: z.literal('profile_ownership') }),
  z.object({
    type: z.literal('entitlement'),
    key: z.string().min(1),
  }),
]);

export type ActionRequirement = z.infer<typeof actionRequirementSchema>;

/** Requirement with its resolution outcome, returned by discovery. */
export const actionRequirementStateSchema = z.object({
  requirement: actionRequirementSchema,
  satisfied: z.boolean(),
  reasonCode: actionErrorCodeSchema.optional(),
});

export type ActionRequirementState = z.infer<
  typeof actionRequirementStateSchema
>;

export interface ActionDescriptor<
  I extends z.ZodType = z.ZodType,
  O extends z.ZodType = z.ZodType,
> {
  readonly id: ActionId;
  readonly schemaVersion: number;
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly effect: ActionEffect;
  readonly confirmation: ActionConfirmation;
  readonly supportedChannels: readonly ActionChannel[];
  readonly requirements: readonly ActionRequirement[];
  readonly minimumClientVersions?: Readonly<
    Partial<Record<ActionChannel, string>>
  >;
  readonly deprecatedAt?: string;
  readonly sunsetAt?: string;
  readonly inputSchema: I;
  readonly outputSchema: O;
}

/**
 * Serializable descriptor as it appears on the wire in discovery payloads:
 * identical metadata, with zod schemas replaced by JSON Schema documents.
 */
export const actionDescriptorPayloadSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  titleKey: z.string().min(1),
  descriptionKey: z.string().min(1),
  effect: z.enum(ACTION_EFFECTS),
  confirmation: z.enum(ACTION_CONFIRMATIONS),
  supportedChannels: z.array(actionChannelSchema).min(1),
  requirements: z.array(actionRequirementSchema),
  minimumClientVersions: z.record(z.string(), z.string()).optional(),
  deprecatedAt: z.iso.datetime().optional(),
  sunsetAt: z.iso.datetime().optional(),
  inputSchema: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()),
});

export type ActionDescriptorPayload = z.infer<
  typeof actionDescriptorPayloadSchema
>;

/**
 * Resolved capability for one action on one channel.
 * `GET /api/v1/actions` returns one per manifest action.
 * Discovery is advisory UX, never authorization.
 */
export const resolvedActionCapabilitySchema = z.object({
  action: actionDescriptorPayloadSchema,
  available: z.boolean(),
  visibility: z.enum(['visible', 'hidden']),
  reasonCode: actionErrorCodeSchema.optional(),
  retryable: z.boolean(),
  requirements: z.array(actionRequirementStateSchema).optional(),
  quota: z
    .object({
      used: z.number().int().nonnegative(),
      limit: z.number().int().positive().nullable(),
    })
    .optional(),
  upgrade: z
    .object({
      eligible: z.boolean(),
      routeRef: z.string().min(1).optional(),
    })
    .optional(),
});

export type ResolvedActionCapability = z.infer<
  typeof resolvedActionCapabilitySchema
>;
