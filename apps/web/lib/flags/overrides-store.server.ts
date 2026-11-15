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

/**
 * Fallback when the override store cannot be read. Most flags fall back to
 * code defaults. Draft visibility is a negative gate: unreadable configuration
 * must not disable its evidence checks.
 */
const UNREADABLE_OVERRIDES: FlagOverrideMap = { OUTBOUND_DOGFOOD_GATE: true };

/** The table probe could not confirm the override table (already logged). */
class FlagOverrideTableUnavailableError extends Error {}

/**
 * Reads the override map or throws. It must throw rather than return a
 * fallback: `unstable_cache` stores every returned value with no expiry, so a
 * fallback returned here would pin one transient failure until the next admin
 * flag write.
 */
async function readOverrideMap(tier: FlagEnvTier): Promise<FlagOverrideMap> {
  // The table probe also returns false on connection failures.
  if (!(await doesTableExist('feature_flag_overrides'))) {
    throw new FlagOverrideTableUnavailableError(
      'feature_flag_overrides table unavailable'
    );
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
}

/**
 * Cached per-env override map. `unstable_cache` keeps this in Next's data
 * cache keyed by tier and tagged `feature-flags`, so steady-state flag reads
 * issue ZERO database queries — the map is only re-read after an admin write
 * calls `revalidateFeatureFlags()`. A failed read is never cached: the
 * fallback is applied here, outside the cached function, so the next read
 * retries the store.
 */
export async function getFlagOverrideMap(
  tier: FlagEnvTier = getFlagEnvTier()
): Promise<FlagOverrideMap> {
  try {
    return await unstable_cache(
      () => readOverrideMap(tier),
      ['feature-flag-overrides', tier],
      { tags: [FEATURE_FLAGS_CACHE_TAG] }
    )();
  } catch (error) {
    if (!(error instanceof FlagOverrideTableUnavailableError)) {
      await captureWarning('Feature flag override read failed', error, {
        tier,
      });
    }
    return { ...UNREADABLE_OVERRIDES };
  }
}

/**
 * Expire the cached override map after an admin write. Immediate expiry (not
 * the stale-while-revalidate `'max'` profile) so the very next read sees the
 * new value: this is the kill-switch path.
 */
export function revalidateFeatureFlags(): void {
  revalidateTag(FEATURE_FLAGS_CACHE_TAG, { expire: 0 });
}
