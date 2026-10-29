#!/usr/bin/env tsx

/**
 * CI-side staging database-isolation gate (JOV-9959).
 *
 * Compares the staging/preview DATABASE_URL host (via Doppler `stg`) against
 * the production database host reference. The production reference is read
 * from env NAMES only:
 *
 *   PROD_DATABASE_URL      full prod connection string (e.g. from the
 *                          existing `DATABASE_URL_MAIN` GitHub secret) —
 *                          parsed in-process, never logged;
 *   PROD_DATABASE_HOST(S)  pre-parsed prod host(s).
 *
 * Never print, echo, or log a secret value or connection string.
 */

import { pathToFileURL } from 'node:url';
import {
  evaluateStagingDbHostGuard,
  type GuardEnv,
  PROD_DATABASE_HOST_ENV_VAR,
  parseDatabaseHost,
} from '@/lib/startup/db-host-guard';

/**
 * Checkable core: returns the process exit code (0 ok, 1 fail). Exported so
 * the exact-head coverage gate and unit tests can exercise every branch
 * without spawning a process.
 */
export function runDbHostIsolationCheck(env: GuardEnv = process.env): number {
  // Prefer a host-name reference when provided; otherwise parse the prod URL
  // in-process. Both paths only ever surface the hostname for comparison.
  const prodUrlHost = parseDatabaseHost(env.PROD_DATABASE_URL);
  const effectiveEnv: GuardEnv =
    prodUrlHost && !env.PROD_DATABASE_HOST && !env.PROD_DATABASE_HOSTS
      ? { ...env, [PROD_DATABASE_HOST_ENV_VAR]: prodUrlHost }
      : env;

  const verdict = evaluateStagingDbHostGuard({ env: effectiveEnv });

  if (!verdict.active) {
    console.log(
      '[db-host-guard] inactive: environment is not staging/preview (JOV-9959).'
    );
    return 0;
  }

  if (verdict.reason === 'prod_database_host_reference_missing') {
    console.error(
      '[db-host-guard] FAIL: no production host reference provided. ' +
        'Set PROD_DATABASE_URL (parsed in-process) or PROD_DATABASE_HOST(S).'
    );
    return 1;
  }

  if (!verdict.ok) {
    console.error(
      '[db-host-guard] FATAL: staging/preview DATABASE_URL resolves to the ' +
        'production database host (JOV-9959). Refusing to deploy.'
    );
    return 1;
  }

  console.log('[db-host-guard] ok: staging database host is isolated.');
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exit(runDbHostIsolationCheck());
}
