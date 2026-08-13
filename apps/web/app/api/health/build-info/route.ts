import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
// Compile-time release version from monorepo root. Bundled into the route so
// the response cannot collapse to 0.0.0 when NEXT_PUBLIC_APP_VERSION is not
// present at runtime (JOV-3459).
import releaseInfo from '../../../../../../version.json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Build-info is the public production identity receipt (JOV-1958). It must
 * never be edge- or browser-cached: a stale commitSha after promote is a
 * false production proof. Keep CDN + browser directives aligned with
 * next.config.js `/api/health/*` headers.
 */
export const BUILD_INFO_CACHE_HEADERS = {
  'cache-control': 'private, no-cache, no-store, must-revalidate',
  'cdn-cache-control': 'no-store',
  'vercel-cdn-cache-control': 'no-store',
  pragma: 'no-cache',
  expires: '0',
} as const;

let _cachedBuildId: string | undefined;

function resolveAppVersion(): string {
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

function resolveCommitSha(): string | undefined {
  const buildSha = env.NEXT_PUBLIC_BUILD_SHA?.trim();
  const runtimeCommitSha = env.VERCEL_GIT_COMMIT_SHA?.trim();
  // Prefer build-time SHA when present (inlined for prebuilt artifacts). Fall
  // back to the runtime Vercel deployment SHA so CLI deploys still identify.
  return [buildSha, runtimeCommitSha].find(sha =>
    /^[0-9a-f]{40}$/.test(sha ?? '')
  );
}

export function GET() {
  const version = resolveAppVersion();
  const environment = env.VERCEL_ENV;
  const isDevelopment = env.NODE_ENV !== 'production';

  if (_cachedBuildId === undefined) {
    try {
      _cachedBuildId = readFileSync(
        join(process.cwd(), '.next/BUILD_ID'),
        'utf-8'
      ).trim();
    } catch {
      if (isDevelopment) {
        _cachedBuildId = 'development';
      } else {
        console.warn('[build-info] BUILD_ID not found — using fallback');
        _cachedBuildId = 'unknown';
      }
    }
  }

  return NextResponse.json(
    {
      buildId: _cachedBuildId,
      version,
      deployedAt: env.VERCEL_DEPLOYMENT_TIME || Date.now(),
      commitSha: resolveCommitSha(),
      environment,
    },
    {
      headers: { ...BUILD_INFO_CACHE_HEADERS },
    }
  );
}
