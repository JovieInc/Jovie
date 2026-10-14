import { z } from 'zod';
import {
  DOGFOOD_ACTOR_KINDS,
  DOGFOOD_BINDING_STATUSES,
  DOGFOOD_CHANNELS,
  DOGFOOD_MODES,
  DOGFOOD_PRODUCTS,
  DOGFOOD_SIGNAL_STATES,
  DOGFOOD_TIERS,
  type DogfoodConsent,
  type DogfoodMode,
  type DogfoodProduct,
  type DogfoodSignalState,
} from '@/lib/db/schema/dogfooders';

const instant = z.string().datetime({ offset: true });
const scope = z.string().trim().min(1).max(96);

export const dogfoodConsentSchema = z
  .object({
    grantedAt: instant.nullable(),
    scope: z.array(scope).max(32),
    source: z.string().trim().min(1).max(96).nullable(),
    revokedAt: instant.nullable(),
  })
  .strict();

export const dogfoodCalibrationSchema = z
  .object({
    knownGoodPassed: z.boolean(),
    knownBrokenPassed: z.boolean(),
    actionableReports: z.number().int().min(0),
    feedbackQualityScore: z.number().min(0).max(1).nullable(),
    completedAt: instant.nullable(),
  })
  .strict();

export const dogfooderBindingInputSchema = z
  .object({
    product: z.enum(DOGFOOD_PRODUCTS),
    accountSubject: z.string().trim().min(1).max(255),
    sessionSubject: z.string().trim().min(1).max(255).nullable().default(null),
    deviceSubject: z.string().trim().min(1).max(255).nullable().default(null),
    status: z.enum(DOGFOOD_BINDING_STATUSES).default('active'),
    expiresAt: instant.nullable().default(null),
    revokedAt: instant.nullable().default(null),
  })
  .strict();

export const dogfooderUpsertSchema = z
  .object({
    actorKey: z.string().trim().min(1).max(128),
    actorKind: z.enum(DOGFOOD_ACTOR_KINDS),
    displayName: z.string().trim().min(1).max(128),
    tier: z.enum(DOGFOOD_TIERS).nullable().default(null),
    products: z.array(z.enum(DOGFOOD_PRODUCTS)).min(1).max(3),
    channel: z.enum(DOGFOOD_CHANNELS).nullable().default(null),
    handle: z.string().trim().min(1).max(320).nullable().default(null),
    jovieUserId: z.string().uuid().nullable().default(null),
    consent: dogfoodConsentSchema,
    signalState: z.enum(DOGFOOD_SIGNAL_STATES),
    vouchedBy: z.literal('tim').nullable().default(null),
    calibration: dogfoodCalibrationSchema.nullable().default(null),
    contactBudget: z
      .object({
        maxContacts: z.number().int().min(0).max(30),
        windowDays: z.number().int().min(1).max(365),
      })
      .strict()
      .default({ maxContacts: 1, windowDays: 7 }),
    scopes: z.array(scope).max(32).default([]),
    allowedModes: z
      .array(z.enum(DOGFOOD_MODES))
      .min(1)
      .max(2)
      .default(['customer_control', 'early_access']),
    membershipExpiresAt: instant.nullable().default(null),
    lastContactedAt: instant.nullable().default(null),
    lastFeedbackAt: instant.nullable().default(null),
    bindings: z.array(dogfooderBindingInputSchema).max(100).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.actorKind === 'agent' && value.tier !== null) {
      context.addIssue({
        code: 'custom',
        path: ['tier'],
        message: 'Agent principals cannot be human signal members',
      });
    }
    if (value.actorKind === 'external_human' && value.tier === null) {
      context.addIssue({
        code: 'custom',
        path: ['tier'],
        message: 'External humans require a signal tier',
      });
    }
    if (value.actorKind === 'agent' && value.handle !== null) {
      context.addIssue({
        code: 'custom',
        path: ['handle'],
        message: 'Agent principals use scoped accounts, not contact handles',
      });
    }
  });

export type DogfooderUpsert = z.infer<typeof dogfooderUpsertSchema>;
export type DogfooderBindingInput = z.infer<typeof dogfooderBindingInputSchema>;

export class DogfoodRosterConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DogfoodRosterConflictError';
  }
}

const TRANSITIONS: Record<DogfoodSignalState, readonly DogfoodSignalState[]> = {
  calibrating: ['calibrating', 'paused', 'qualified', 'retired'],
  consented: ['calibrating', 'consented', 'paused', 'qualified', 'retired'],
  invited: ['consented', 'invited', 'paused', 'retired'],
  paused: ['calibrating', 'consented', 'paused', 'qualified', 'retired'],
  qualified: ['paused', 'qualified', 'retired'],
  retired: ['retired'],
};

function hasLiveConsent(input: DogfooderUpsert): boolean {
  return input.consent.grantedAt !== null && input.consent.revokedAt === null;
}

function hasQualifiedCalibration(input: DogfooderUpsert): boolean {
  return (
    input.calibration?.knownGoodPassed === true &&
    input.calibration.knownBrokenPassed === true &&
    input.calibration.actionableReports >= 2
  );
}

export function normalizeDogfooderUpsert(
  currentState: DogfoodSignalState | null,
  input: DogfooderUpsert
): DogfooderUpsert {
  let signalState = input.signalState;
  if (input.consent.revokedAt !== null && signalState !== 'retired') {
    signalState = 'paused';
  }

  if (
    currentState !== null &&
    !TRANSITIONS[currentState].includes(signalState)
  ) {
    throw new DogfoodRosterConflictError(
      `Invalid dogfood signal transition: ${currentState} -> ${signalState}`
    );
  }

  if (
    ['consented', 'calibrating', 'qualified'].includes(signalState) &&
    !hasLiveConsent(input)
  ) {
    throw new DogfoodRosterConflictError(
      `${signalState} requires unrevoked consent`
    );
  }

  const skipsCalibration =
    input.actorKind === 'agent' ||
    (input.actorKind === 'internal_human' && input.tier === null) ||
    (input.tier === 'advisor' && input.vouchedBy === 'tim');
  if (
    signalState === 'qualified' &&
    !skipsCalibration &&
    !hasQualifiedCalibration(input)
  ) {
    throw new DogfoodRosterConflictError(
      'Qualified pool members require completed calibration'
    );
  }

  return {
    ...input,
    signalState,
    products: [...new Set(input.products)].sort() as DogfoodProduct[],
    scopes: [...new Set(input.scopes)].sort(),
    allowedModes: [...new Set(input.allowedModes)].sort() as DogfoodMode[],
  };
}

export interface DogfoodExposureMembership {
  readonly id: string;
  readonly actorKey: string;
  readonly products: readonly DogfoodProduct[];
  readonly scopes: readonly string[];
  readonly allowedModes: readonly DogfoodMode[];
  readonly signalState: DogfoodSignalState;
  readonly consent: DogfoodConsent;
  readonly membershipExpiresAt: Date | null;
}

export interface DogfoodExposureBinding {
  readonly id: string;
  readonly status: (typeof DOGFOOD_BINDING_STATUSES)[number];
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
}

export type DogfoodExposureDenial =
  | 'consent_required'
  | 'mode_not_allowed'
  | 'retired_or_paused'
  | 'stale_binding'
  | 'stale_membership'
  | 'unauthorized_product'
  | 'unauthorized_scope';

export function evaluateDogfoodExposure(input: {
  readonly membership: DogfoodExposureMembership;
  readonly binding: DogfoodExposureBinding;
  readonly product: DogfoodProduct;
  readonly mode: DogfoodMode;
  readonly requestedScopes: readonly string[];
  readonly now: Date;
}) {
  const expectedScopes =
    input.mode === 'customer_control'
      ? []
      : [...new Set(input.requestedScopes)].sort();
  const expected = {
    product: input.product,
    mode: input.mode,
    scopes: expectedScopes,
  } as const;
  const denied = (
    reason: DogfoodExposureDenial,
    action?: 'refresh_binding' | 'refresh_membership'
  ) =>
    ({
      eligible: false,
      reason,
      expected,
      repair: action
        ? { owner: 'summer', action, membershipId: input.membership.id }
        : null,
    }) as const;

  if (
    input.membership.signalState === 'paused' ||
    input.membership.signalState === 'retired'
  ) {
    return denied('retired_or_paused');
  }
  if (
    input.membership.consent.grantedAt === null ||
    input.membership.consent.revokedAt !== null
  ) {
    return denied('consent_required');
  }
  if (!input.membership.products.includes(input.product)) {
    return denied('unauthorized_product');
  }
  if (!input.membership.allowedModes.includes(input.mode)) {
    return denied('mode_not_allowed');
  }
  if (
    input.membership.membershipExpiresAt !== null &&
    input.membership.membershipExpiresAt <= input.now
  ) {
    return denied('stale_membership', 'refresh_membership');
  }
  if (
    input.binding.status !== 'active' ||
    input.binding.revokedAt !== null ||
    (input.binding.expiresAt !== null && input.binding.expiresAt <= input.now)
  ) {
    return denied('stale_binding', 'refresh_binding');
  }
  if (
    input.mode === 'early_access' &&
    expectedScopes.some(value => !input.membership.scopes.includes(value))
  ) {
    return denied('unauthorized_scope');
  }

  return {
    eligible: true,
    membershipId: input.membership.id,
    actorKey: input.membership.actorKey,
    bindingId: input.binding.id,
    expected,
    preserves: {
      killSwitches: true,
      permissions: true,
      entitlements: true,
      dataIsolation: true,
      spendControls: true,
    },
  } as const;
}
