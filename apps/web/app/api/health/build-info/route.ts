import { NextResponse } from 'next/server';
import { getDeployedBuildInfo } from '@/lib/observability/build-info';
import { getWorktreeIdentity } from '@/lib/observability/worktree-runtime';

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

export async function GET() {
  const worktree = getWorktreeIdentity();
  const build = await getDeployedBuildInfo();

  return NextResponse.json(
    {
      buildId: build.buildId,
      version: build.version,
      deployedAt: build.deployedAt,
      commitSha: build.commitSha,
      deploymentId: build.deploymentId,
      environment: build.environment,
      ...(worktree ? { worktree } : {}),
    },
    {
      headers: { ...BUILD_INFO_CACHE_HEADERS },
    }
  );
}
