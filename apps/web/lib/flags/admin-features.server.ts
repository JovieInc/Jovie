import 'server-only';
import { db, doesTableExist } from '@/lib/db';
import { featureFlagOverrides } from '@/lib/db/schema/feature-flags';
import { captureWarning } from '@/lib/error-tracking';
import {
  APP_FLAG_DEFAULTS,
  APP_FLAG_DESCRIPTIONS,
  type AppFlagName,
} from './contracts';

/** One admin Features table row: flag metadata + each env's raw override cell. */
export interface FeatureFlagAdminRow {
  readonly flagKey: AppFlagName;
  readonly name: string;
  readonly description: string;
  readonly defaultEnabled: boolean;
  readonly dev: boolean | null;
  readonly staging: boolean | null;
  readonly prod: boolean | null;
}

const RUNTIME_FLAG_NAMES = Object.keys(APP_FLAG_DEFAULTS) as AppFlagName[];

/**
 * A persisted override cell is only a boolean or an explicit `null`
 * (inheriting the code default). Anything else is a malformed source row:
 * fail the read instead of displaying fabricated flag values.
 */
function parseOverrideCell(
  value: unknown,
  flagKey: string,
  envTier: 'dev' | 'staging' | 'prod'
): boolean | null {
  if (value === null) return null;
  if (typeof value !== 'boolean') {
    throw new Error(
      `Feature flag override row for ${flagKey} is malformed (${envTier} cell).`
    );
  }
  return value;
}

export async function getFeatureFlagAdminRows(): Promise<
  FeatureFlagAdminRow[]
> {
  const overridesByKey = new Map<
    string,
    { dev: boolean | null; staging: boolean | null; prod: boolean | null }
  >();

  if (!(await doesTableExist('feature_flag_overrides'))) {
    throw new Error('Feature flag overrides are unavailable.');
  }
  try {
    const rows = await db
      .select({
        flagKey: featureFlagOverrides.flagKey,
        dev: featureFlagOverrides.devEnabled,
        staging: featureFlagOverrides.stagingEnabled,
        prod: featureFlagOverrides.prodEnabled,
      })
      .from(featureFlagOverrides);
    for (const row of rows) {
      overridesByKey.set(row.flagKey, {
        dev: parseOverrideCell(row.dev, row.flagKey, 'dev'),
        staging: parseOverrideCell(row.staging, row.flagKey, 'staging'),
        prod: parseOverrideCell(row.prod, row.flagKey, 'prod'),
      });
    }
  } catch (error) {
    await captureWarning('Feature flag admin rows read failed', error);
    throw error;
  }

  return RUNTIME_FLAG_NAMES.map(flagKey => {
    const override = overridesByKey.get(flagKey);
    return {
      flagKey,
      name: flagKey
        .toLowerCase()
        .replaceAll('_', ' ')
        .replace(/^\w/, c => c.toUpperCase()),
      description: APP_FLAG_DESCRIPTIONS[flagKey],
      defaultEnabled: APP_FLAG_DEFAULTS[flagKey],
      dev: override?.dev ?? null,
      staging: override?.staging ?? null,
      prod: override?.prod ?? null,
    };
  });
}
