import 'server-only';
import { revalidateTag, unstable_cache } from 'next/cache';
import { db, doesTableExist } from '@/lib/db';
import { featureFlagOverrides } from '@/lib/db/schema/feature-flags';
import { captureWarning } from '@/lib/error-tracking';
import type { AppFlagName } from './contracts';
import { type FlagEnvTier, getFlagEnvTier } from './env-tier';

export const FEATURE_FLAGS_CACHE_TAG = 'feature-flags';

/** Per-env override map: only flags with a non-null cell for `tier`. */
export type FlagOverrideMap = Partial<Record<AppFlagName, boolean>>;

function columnFor(tier: FlagEnvTier) {
  if (tier === 'prod') return featureFlagOverrides.prodEnabled;
  if (tier === 'staging') return featureFlagOverrides.stagingEnabled;
  return featureFlagOverrides.devEnabled;
}

async function readOverrideMap(tier: FlagEnvTier): Promise<FlagOverrideMap> {
  try {
    // Fail safe before the migration lands (CI seeding / fresh branch): no
    // table means no overrides, so every flag falls through to its default.
    if (!(await doesTableExist('feature_flag_overrides'))) {
      return {};
    }

    const rows = await db
      .select({
        flagKey: featureFlagOverrides.flagKey,
        value: columnFor(tier),
      })
      .from(featureFlagOverrides);

    const map: FlagOverrideMap = {};
    for (const row of rows) {
      if (row.value !== null && row.value !== undefined) {
        map[row.flagKey as AppFlagName] = row.value;
      }
    }
    return map;
  } catch (error) {
    // Override store is a convenience layer — never break flag resolution if
    // the DB hiccups. Fall back to code defaults.
    await captureWarning('Feature flag override read failed', error, { tier });
    return {};
  }
}

/**
 * Cached per-env override map. `unstable_cache` keeps this in Next's data
 * cache keyed by tier and tagged `feature-flags`, so steady-state flag reads
 * issue ZERO database queries — the map is only re-read after an admin write
 * calls `revalidateFeatureFlags()`.
 */
export function getFlagOverrideMap(
  tier: FlagEnvTier = getFlagEnvTier()
): Promise<FlagOverrideMap> {
  return unstable_cache(
    () => readOverrideMap(tier),
    ['feature-flag-overrides', tier],
    { tags: [FEATURE_FLAGS_CACHE_TAG] }
  )();
}

/** Invalidate the cached override map after an admin write. */
export function revalidateFeatureFlags(): void {
  revalidateTag(FEATURE_FLAGS_CACHE_TAG, 'max');
}
