/**
 * Deployment tier for per-environment feature flag overrides.
 *
 * Maps the runtime to one of three columns in `feature_flag_overrides`.
 * `VERCEL_ENV` is the source of truth: `production` is jov.ie; every Vercel
 * `preview` deploy (including the staging.jov.ie alias) maps to `staging`;
 * anything else (local dev, tests) is `dev`.
 */
export type FlagEnvTier = 'dev' | 'staging' | 'prod';

export function getFlagEnvTier(): FlagEnvTier {
  switch (process.env.VERCEL_ENV) {
    case 'production':
      return 'prod';
    case 'preview':
      return 'staging';
    default:
      return 'dev';
  }
}

/** Column name on `feature_flag_overrides` for a given tier. */
export const FLAG_ENV_TIER_COLUMN = {
  dev: 'devEnabled',
  staging: 'stagingEnabled',
  prod: 'prodEnabled',
} as const satisfies Record<FlagEnvTier, string>;
