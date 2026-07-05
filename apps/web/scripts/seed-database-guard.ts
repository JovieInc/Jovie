/**
 * Refuse seed/demo scripts against production databases.
 *
 * drizzle-seed.ts previously only skipped when VERCEL_GIT_COMMIT_REF ===
 * 'production', which does not protect `doppler run --config prd -- tsx ...`.
 */

export type DatabaseTarget = 'production' | 'non-production';

export interface DatabaseTargetAssessment {
  readonly target: DatabaseTarget;
  readonly reasons: readonly string[];
}

const PRODUCTION_DOPPLER_CONFIGS = new Set(['prd', 'prod', 'production']);

function readEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function redactDatabaseUrl(databaseUrl: string): string {
  try {
    const parsed = new URL(databaseUrl);
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

export function assessDatabaseTarget(
  env: NodeJS.ProcessEnv = process.env
): DatabaseTargetAssessment {
  const reasons: string[] = [];
  const databaseUrl = readEnv(env, 'DATABASE_URL')?.toLowerCase() ?? '';
  const databaseUrlMain =
    readEnv(env, 'DATABASE_URL_MAIN')?.toLowerCase() ?? '';

  const dopplerConfig = readEnv(env, 'DOPPLER_CONFIG')?.toLowerCase();
  if (dopplerConfig && PRODUCTION_DOPPLER_CONFIGS.has(dopplerConfig)) {
    reasons.push(`DOPPLER_CONFIG=${dopplerConfig}`);
  }

  const dopplerEnvironment = readEnv(env, 'DOPPLER_ENVIRONMENT')?.toLowerCase();
  if (dopplerEnvironment === 'production' || dopplerEnvironment === 'prd') {
    reasons.push(`DOPPLER_ENVIRONMENT=${dopplerEnvironment}`);
  }

  if (readEnv(env, 'VERCEL_ENV') === 'production') {
    reasons.push('VERCEL_ENV=production');
  }

  const gitBranch =
    readEnv(env, 'VERCEL_GIT_COMMIT_REF') ??
    readEnv(env, 'GIT_BRANCH') ??
    undefined;
  if (gitBranch === 'main' || gitBranch === 'production') {
    reasons.push(`git branch=${gitBranch}`);
  }

  if (databaseUrl.includes('production')) {
    reasons.push('DATABASE_URL contains "production"');
  }

  if (databaseUrlMain && databaseUrl && databaseUrl === databaseUrlMain) {
    reasons.push('DATABASE_URL matches DATABASE_URL_MAIN');
  }

  return {
    target: reasons.length > 0 ? 'production' : 'non-production',
    reasons,
  };
}

export function isProductionDatabaseTarget(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return assessDatabaseTarget(env).target === 'production';
}

export interface AssertSeedDatabaseTargetOptions {
  readonly scriptName: string;
  readonly allowProductionOverride?: boolean;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Exit the process when the active database target looks like production.
 * Set ALLOW_PRODUCTION_SEED=1 to override (same pattern as ALLOW_PROD_MIGRATIONS).
 */
export function assertSeedDatabaseTarget(
  options: AssertSeedDatabaseTargetOptions
): void {
  const env = options.env ?? process.env;
  const assessment = assessDatabaseTarget(env);

  if (assessment.target !== 'production') {
    return;
  }

  const allowOverride =
    options.allowProductionOverride === true ||
    readEnv(env, 'ALLOW_PRODUCTION_SEED') === '1';

  if (allowOverride) {
    console.warn(
      `⚠️  ${options.scriptName}: ALLOW_PRODUCTION_SEED=1 override — proceeding against production signals: ${assessment.reasons.join(', ')}`
    );
    return;
  }

  const databaseUrl = readEnv(env, 'DATABASE_URL');
  console.error(
    `❌ ${options.scriptName} refused: production database target detected.`
  );
  console.error(`   Signals: ${assessment.reasons.join(', ')}`);
  if (databaseUrl) {
    console.error(`   DATABASE_URL host: ${redactDatabaseUrl(databaseUrl)}`);
  }
  console.error(
    '   Seed/demo scripts must run against dev or preview databases only.'
  );
  console.error(
    '   If you truly intend production, set ALLOW_PRODUCTION_SEED=1 explicitly.'
  );
  process.exit(1);
}
