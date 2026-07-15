import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let _cachedBuildId: string | undefined;

export function GET() {
  const version = env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';
  const environment = env.VERCEL_ENV;
  const isDevelopment = env.NODE_ENV !== 'production';
  const buildSha = env.NEXT_PUBLIC_BUILD_SHA?.trim().slice(0, 7);
  const runtimeCommitSha = env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);

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
      commitSha: buildSha || runtimeCommitSha,
      environment,
    },
    {
      headers: {
        'cache-control': 'no-store',
      },
    }
  );
}
