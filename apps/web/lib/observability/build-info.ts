import 'server-only';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { env } from '@/lib/env';
// Compile-time release version from monorepo root. Bundled in so the value
// cannot collapse to 0.0.0 when NEXT_PUBLIC_APP_VERSION is absent at runtime
// (JOV-3459).
import releaseInfo from '../../../../version.json';

export interface DeployedBuildInfo {
  readonly buildId: string;
  readonly version: string;
  readonly commitSha: string | undefined;
  readonly deploymentId: string | undefined;
  readonly environment: string | undefined;
  readonly deployedAt: string | number;
}

let _cachedBuildId: string | undefined;

export function resolveAppVersion(): string {
  // Prefer static process.env access so Next.js can inline the next.config.js
  // `env` value. Fall back to the bundled version.json so we never ship the
  // unresolved 0.0.0 placeholder when the env slot is empty.
  const fromEnv = process.env.NEXT_PUBLIC_APP_VERSION?.trim();
  if (fromEnv && fromEnv !== '0.0.0') {
    return fromEnv;
  }
  const fromRelease = releaseInfo.version?.trim();
  if (fromRelease && fromRelease !== '0.0.0') {
    return fromRelease;
  }
  return '0.0.0';
}

export function resolveCommitSha(): string | undefined {
  const buildSha = env.NEXT_PUBLIC_BUILD_SHA?.trim();
  const runtimeCommitSha = env.VERCEL_GIT_COMMIT_SHA?.trim();
  // Prefer build-time SHA when present (inlined for prebuilt artifacts). Fall
  // back to the runtime Vercel deployment SHA so CLI deploys still identify.
  return [buildSha, runtimeCommitSha].find(sha =>
    /^[0-9a-f]{40}$/.test(sha ?? '')
  );
}

export function resolveBuildId(): string {
  if (_cachedBuildId === undefined) {
    try {
      _cachedBuildId = readFileSync(
        join(process.cwd(), '.next/BUILD_ID'),
        'utf-8'
      ).trim();
    } catch {
      if (env.NODE_ENV !== 'production') {
        _cachedBuildId = 'development';
      } else {
        console.warn('[build-info] BUILD_ID not found — using fallback');
        _cachedBuildId = 'unknown';
      }
    }
  }
  return _cachedBuildId;
}

/** The deployed build this server is actually running — the exact deployment
 * half of the capability evidence chain (JOV-7485). */
export function getDeployedBuildInfo(): DeployedBuildInfo {
  return {
    buildId: resolveBuildId(),
    version: resolveAppVersion(),
    commitSha: resolveCommitSha(),
    deploymentId: env.VERCEL_DEPLOYMENT_ID,
    environment: env.VERCEL_ENV,
    deployedAt: env.VERCEL_DEPLOYMENT_TIME || Date.now(),
  };
}
