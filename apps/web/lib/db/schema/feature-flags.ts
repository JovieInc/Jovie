import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Per-environment runtime overrides for code-defined feature flags.
 *
 * One row per flag. Each env column is nullable: `null` means "inherit the
 * code default" (`APP_FLAG_DEFAULTS`), so an absent row or null cell is a
 * no-op and the override layer is purely additive. A non-null boolean forces
 * the flag on/off for that environment.
 *
 * Read through `lib/flags/overrides-store.server.ts` (cached via
 * `unstable_cache` + `revalidateTag('feature-flags')`), so the hot path
 * issues zero DB reads in steady state. Written only by the admin Features
 * page / dev bar "publish to env" action.
 */
export const featureFlagOverrides = pgTable('feature_flag_overrides', {
  flagKey: text('flag_key').primaryKey(),
  devEnabled: boolean('dev_enabled'),
  stagingEnabled: boolean('staging_enabled'),
  prodEnabled: boolean('prod_enabled'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  // Clerk user id of the admin who last wrote the row (text, matches the
  // identifier used by /api/admin/set-plan). Nullable for safety.
  updatedBy: text('updated_by'),
});

export type FeatureFlagOverrideRow = typeof featureFlagOverrides.$inferSelect;

/**
 * Append-only audit log for runtime feature flag changes.
 *
 * One row per write to `feature_flag_overrides` (enable, disable, reset) plus
 * rollback events that re-apply a previously recorded value. `previousValue` /
 * `newValue` store the raw override cell: `null` means "inherit the code
 * default" for that environment. Written by `/api/admin/feature-flags` and
 * `/api/admin/feature-flags/rollback`; read by the admin Features page audit
 * section. Never updated or deleted by app code.
 */
export const featureFlagAuditEvents = pgTable(
  'feature_flag_audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    flagKey: text('flag_key').notNull(),
    envTier: text('env_tier').notNull(),
    // 'enable' | 'disable' | 'reset' | 'rollback'
    action: text('action').notNull(),
    // App users.id of the admin who made the change (text, matches
    // feature_flag_overrides.updated_by). Nullable for safety.
    actor: text('actor'),
    previousValue: boolean('previous_value'),
    newValue: boolean('new_value'),
    reason: text('reason'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    flagKeyIdx: index('idx_feature_flag_audit_events_flag_key').on(
      table.flagKey
    ),
    envTierIdx: index('idx_feature_flag_audit_events_env_tier').on(
      table.envTier
    ),
    createdAtIdx: index('idx_feature_flag_audit_events_created_at').on(
      table.createdAt
    ),
  })
);

export type FeatureFlagAuditEventRow =
  typeof featureFlagAuditEvents.$inferSelect;
