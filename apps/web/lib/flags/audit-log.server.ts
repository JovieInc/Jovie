import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db, doesTableExist } from '@/lib/db';
import { featureFlagAuditEvents } from '@/lib/db/schema/feature-flags';
import { captureWarning } from '@/lib/error-tracking';
import { APP_FLAG_DEFAULTS, APP_FLAG_DESCRIPTIONS } from './contracts';
import type { FlagEnvTier } from './env-tier';
import type { FlagChangeAction } from './write-override.server';

/** Where a flag value comes from: a DB override or the code default. */
export type FlagValueSource = 'override' | 'default';

/** One audit row shaped for the admin Features page. */
export interface FeatureFlagAuditEvent {
  readonly id: string;
  readonly flagKey: string;
  readonly name: string;
  readonly envTier: string;
  readonly action: FlagChangeAction;
  readonly actor: string | null;
  /** Raw override cell before the change; `null` = was inheriting default. */
  readonly previousValue: boolean | null;
  readonly previousSource: FlagValueSource;
  /** Effective value before the change (override ?? code default), when known. */
  readonly previousEffective: boolean | null;
  readonly newValue: boolean | null;
  readonly newSource: FlagValueSource;
  readonly newEffective: boolean | null;
  readonly reason: string | null;
  /** ISO timestamp for machine use + preformatted UTC label for display. */
  readonly createdAt: string;
  readonly createdAtLabel: string;
  /** Rollback is safe only while the flag is still registered in code. */
  readonly canRollback: boolean;
}

export interface FeatureFlagAuditFilter {
  readonly flagKey?: string;
  readonly envTier?: FlagEnvTier;
  readonly limit?: number;
}

const DEFAULT_LIMIT = 50;

function sourceOf(value: boolean | null): FlagValueSource {
  return value === null ? 'default' : 'override';
}

function effectiveOf(flagKey: string, value: boolean | null): boolean | null {
  if (value !== null) return value;
  const defaults = APP_FLAG_DEFAULTS as Record<string, boolean | undefined>;
  return defaults[flagKey] ?? null;
}

/** Deterministic UTC label — avoids server/client locale hydration drift. */
function formatUtc(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`
  );
}

/**
 * Recent feature flag changes for the admin Features page, newest first.
 * Fails open to an empty list (with a captured warning) so the page still
 * renders when the audit table is unavailable.
 */
export async function getFeatureFlagAuditEvents(
  filter: FeatureFlagAuditFilter = {}
): Promise<FeatureFlagAuditEvent[]> {
  if (!(await doesTableExist('feature_flag_audit_events'))) {
    return [];
  }

  const conditions = [
    filter.flagKey ? eq(featureFlagAuditEvents.flagKey, filter.flagKey) : null,
    filter.envTier ? eq(featureFlagAuditEvents.envTier, filter.envTier) : null,
  ].filter((c): c is NonNullable<typeof c> => c !== null);

  try {
    const rows = await db
      .select()
      .from(featureFlagAuditEvents)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(featureFlagAuditEvents.createdAt))
      .limit(filter.limit ?? DEFAULT_LIMIT);

    const descriptions = APP_FLAG_DESCRIPTIONS as Record<
      string,
      string | undefined
    >;

    return rows.map(row => ({
      id: row.id,
      flagKey: row.flagKey,
      name:
        descriptions[row.flagKey] !== undefined
          ? row.flagKey
              .toLowerCase()
              .replaceAll('_', ' ')
              .replace(/^\w/, c => c.toUpperCase())
          : row.flagKey,
      envTier: row.envTier,
      action: row.action as FlagChangeAction,
      actor: row.actor,
      previousValue: row.previousValue,
      previousSource: sourceOf(row.previousValue),
      previousEffective: effectiveOf(row.flagKey, row.previousValue),
      newValue: row.newValue,
      newSource: sourceOf(row.newValue),
      newEffective: effectiveOf(row.flagKey, row.newValue),
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
      createdAtLabel: formatUtc(row.createdAt),
      canRollback: row.flagKey in APP_FLAG_DEFAULTS,
    }));
  } catch (error) {
    await captureWarning('Feature flag audit events read failed', error);
    return [];
  }
}
