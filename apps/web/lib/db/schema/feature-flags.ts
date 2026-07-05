import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

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
