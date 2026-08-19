import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  featureFlagAuditEvents,
  featureFlagOverrides,
} from '@/lib/db/schema/feature-flags';
import { FLAG_ENV_TIER_COLUMN, type FlagEnvTier } from './env-tier';
import { revalidateFeatureFlags } from './overrides-store.server';

/** Audit action types recorded in `feature_flag_audit_events`. */
export type FlagChangeAction = 'enable' | 'disable' | 'reset' | 'rollback';

/** Derive the audit action for a direct cell write (`null` = reset to default). */
export function getFlagChangeAction(enabled: boolean | null): FlagChangeAction {
  if (enabled === null) return 'reset';
  return enabled ? 'enable' : 'disable';
}

export interface WriteFlagOverrideInput {
  readonly flagKey: string;
  readonly envTier: FlagEnvTier;
  /** Raw override cell to write; `null` clears back to the code default. */
  readonly enabled: boolean | null;
  /** App users.id of the admin performing the change. */
  readonly actor: string;
  /** Defaults to the action derived from `enabled`; pass 'rollback' for rollbacks. */
  readonly action?: FlagChangeAction;
  readonly reason?: string;
}

export interface WriteFlagOverrideResult {
  /** Override cell value before the write (`null` = was inheriting default). */
  readonly previousValue: boolean | null;
}

/**
 * Read the current cell, upsert the override, and append an audit event.
 * Shared by the flag write route and the rollback route so every change is
 * attributable. Throws on DB failure — callers translate to a 500 so a
 * change never silently goes unaudited.
 */
export async function writeFlagOverride(
  input: WriteFlagOverrideInput
): Promise<WriteFlagOverrideResult> {
  const column = FLAG_ENV_TIER_COLUMN[input.envTier];

  const existing = await db
    .select({ value: featureFlagOverrides[column] })
    .from(featureFlagOverrides)
    .where(eq(featureFlagOverrides.flagKey, input.flagKey));
  const previousValue = existing[0]?.value ?? null;

  await db
    .insert(featureFlagOverrides)
    .values({
      flagKey: input.flagKey,
      [column]: input.enabled,
      updatedBy: input.actor,
    })
    .onConflictDoUpdate({
      target: featureFlagOverrides.flagKey,
      set: {
        [column]: input.enabled,
        updatedAt: new Date(),
        updatedBy: input.actor,
      },
    });

  await db.insert(featureFlagAuditEvents).values({
    flagKey: input.flagKey,
    envTier: input.envTier,
    action: input.action ?? getFlagChangeAction(input.enabled),
    actor: input.actor,
    previousValue,
    newValue: input.enabled,
    reason: input.reason ?? null,
  });

  revalidateFeatureFlags();

  return { previousValue };
}
