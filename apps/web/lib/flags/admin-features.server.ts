import 'server-only';
import { db, doesTableExist } from '@/lib/db';
import { featureFlagOverrides } from '@/lib/db/schema/feature-flags';
import { captureWarning } from '@/lib/error-tracking';
import {
  APP_FLAG_DEFAULTS,
  APP_FLAG_DESCRIPTIONS,
  type AppFlagName,
  DESIGN_V1_ALIAS_FLAGS,
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

const ALIAS_FLAGS = new Set<string>(DESIGN_V1_ALIAS_FLAGS);

/** Runtime flags shown in the admin UI (DESIGN_V1 surface aliases collapsed out). */
const RUNTIME_FLAG_NAMES = (
  Object.keys(APP_FLAG_DEFAULTS) as AppFlagName[]
).filter(name => !ALIAS_FLAGS.has(name));

export async function getFeatureFlagAdminRows(): Promise<
  FeatureFlagAdminRow[]
> {
  const overridesByKey = new Map<
    string,
    { dev: boolean | null; staging: boolean | null; prod: boolean | null }
  >();

  if (await doesTableExist('feature_flag_overrides')) {
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
          dev: row.dev,
          staging: row.staging,
          prod: row.prod,
        });
      }
    } catch (error) {
      await captureWarning('Feature flag admin rows read failed', error);
    }
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
