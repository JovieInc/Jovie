/**
 * Staging/preview database-isolation guard (JOV-9959).
 *
 * Fails boot when a staging or preview runtime resolves DATABASE_URL to the
 * production database host. The production host is supplied by operators via
 * environment NAMES (PROD_DATABASE_HOST / PROD_DATABASE_HOSTS) — the host
 * values are never hardcoded here and connection-string text is never logged.
 */

type GuardEnv = Readonly<Record<string, string | undefined>>;

export type { GuardEnv };

export type DbHostGuardVerdict = {
  /** Guard applies to this environment (staging or preview). */
  active: boolean;
  /** Enough information was present to perform the comparison. */
  checked: boolean;
  /** No production-host collision detected. */
  ok: boolean;
  /** Machine-readable reason; never contains URL or credential text. */
  reason: string | null;
};

export const PROD_DATABASE_HOST_ENV_VAR = 'PROD_DATABASE_HOST';
export const PROD_DATABASE_HOSTS_ENV_VAR = 'PROD_DATABASE_HOSTS';

/**
 * Extract the hostname from a postgres connection string, or null when the
 * value is missing, unparsable, or not a postgres URL. Never returns URL
 * text — the hostname alone is infra-identifying, not a credential.
 */
export function parseDatabaseHost(databaseUrl: unknown): string | null {
  if (typeof databaseUrl !== 'string' || !databaseUrl.trim()) {
    return null;
  }
  try {
    const url = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
      return null;
    }
    if (!url.hostname) {
      return null;
    }
    return normalizeDbHost(url.hostname);
  } catch {
    return null;
  }
}

/**
 * Normalize a host for comparison. Neon pooler endpoints and their direct
 * endpoints share one database, so `-pooler.` is collapsed — following the
 * canonical precedent in scripts/lib/claim-test-environment.mjs.
 */
export function normalizeDbHost(host: string): string {
  return host
    .trim()
    .toLowerCase()
    .replace(/-pooler\./, '.')
    .replace(/\.$/, '');
}

/**
 * Staging/preview detection. staging.jov.ie is an alias inside the same
 * Vercel project, so VERCEL_ENV alone is not sufficient: staging builds pin
 * NEXT_PUBLIC_APP_URL to the staging host at build time.
 */
export function isStagingLikeEnvironment(env: GuardEnv): boolean {
  if (env.VERCEL_ENV === 'preview') {
    return true;
  }
  if ((env.JOVIE_ENV ?? '').trim().toLowerCase() === 'staging') {
    return true;
  }
  const appUrlHost = parseAppUrlHost(env.NEXT_PUBLIC_APP_URL);
  return appUrlHost === 'staging.jov.ie';
}

function parseAppUrlHost(appUrl: unknown): string | null {
  if (typeof appUrl !== 'string' || !appUrl.trim()) {
    return null;
  }
  try {
    return new URL(appUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Production reference hosts come from operator-provided env names only.
 * Never put a host value in source control.
 */
export function readProdDatabaseHosts(env: GuardEnv): string[] {
  const single = env[PROD_DATABASE_HOST_ENV_VAR];
  const many = env[PROD_DATABASE_HOSTS_ENV_VAR];
  const raw = [
    ...(single ? single.split(',') : []),
    ...(many ? many.split(',') : []),
  ];
  return raw
    .map(part => part.trim())
    .filter(Boolean)
    .map(normalizeDbHost);
}

export function evaluateStagingDbHostGuard(input: {
  env: GuardEnv;
}): DbHostGuardVerdict {
  const { env } = input;

  if (!isStagingLikeEnvironment(env)) {
    return { active: false, checked: false, ok: true, reason: null };
  }

  const databaseUrl = env.DATABASE_URL;
  const databaseHost = parseDatabaseHost(databaseUrl);
  if (!databaseHost) {
    // Cannot classify — refuse silently here; DATABASE_URL presence/shape is
    // already a critical failure of the startup environment validator.
    return {
      active: true,
      checked: false,
      ok: true,
      reason: 'database_url_unparsable',
    };
  }

  const prodHosts = readProdDatabaseHosts(env);
  if (prodHosts.length === 0) {
    // No production reference provisioned for this environment — the check
    // cannot run. Operators must set the reference so isolation is provable.
    return {
      active: true,
      checked: false,
      ok: true,
      reason: 'prod_database_host_reference_missing',
    };
  }

  if (prodHosts.includes(databaseHost)) {
    return {
      active: true,
      checked: true,
      ok: false,
      reason: 'staging_database_url_matches_production_host',
    };
  }

  return { active: true, checked: true, ok: true, reason: null };
}

/**
 * Boot-time entry point: throws on a staging/preview → production DB host
 * collision so the deployment fails loudly instead of pointing at prod data.
 * The thrown message names env vars only — never connection-string text.
 */
export function assertStagingDatabaseIsolation(
  env: GuardEnv = process.env
): void {
  const verdict = evaluateStagingDbHostGuard({ env });

  if (!verdict.active) {
    return;
  }

  if (verdict.reason === 'prod_database_host_reference_missing') {
    console.warn(
      `[DB-HOST-GUARD] ${PROD_DATABASE_HOST_ENV_VAR}/${PROD_DATABASE_HOSTS_ENV_VAR} ` +
        'not provisioned for this staging/preview environment; ' +
        'staging-vs-production database isolation is UNVERIFIED (JOV-9959).'
    );
    return;
  }

  if (!verdict.ok) {
    throw new Error(
      'DB-HOST-GUARD, JOV-9959: staging/preview DATABASE_URL resolves to the ' +
        'production database host. Refusing to boot. Set a dedicated database ' +
        'in Doppler config for this environment and provide the production ' +
        `host via ${PROD_DATABASE_HOST_ENV_VAR} or ` +
        `${PROD_DATABASE_HOSTS_ENV_VAR} for comparison.`
    );
  }
}
