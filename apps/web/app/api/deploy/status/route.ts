import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { logger } from '@/lib/utils/logger';

const VERCEL_API = 'https://api.vercel.com';

/**
 * GET /api/deploy/status
 * Compare staging (current) SHA with latest production deployment SHA.
 *
 * Requires: Admin privileges
 */
export async function GET() {
  const authError = await requireAdmin();
  if (authError) return authError;

  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  const stagingSha = process.env.NEXT_PUBLIC_BUILD_SHA ?? '';

  if (!token || !projectId || !teamId) {
    return NextResponse.json(
      { error: 'Deploy status not configured' },
      { status: 500 }
    );
  }

  try {
    const url = `${VERCEL_API}/v6/deployments?projectId=${projectId}&teamId=${teamId}&target=production&limit=1&state=READY`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      if (response.status === 429) {
        return NextResponse.json(
          { error: 'Vercel API rate limited' },
          { status: 429 }
        );
      }
      throw new Error(`Vercel API returned ${response.status}`);
    }

    const data = await response.json();
    const latestProd = data.deployments?.[0];
    const prodSha = latestProd?.meta?.githubCommitSha?.slice(0, 7) ?? '';
    const prodDeployedAt = latestProd?.created
      ? new Date(latestProd.created).toISOString()
      : null;

    // Normalize both SHAs to 7 chars before comparing
    const needsPromote =
      stagingSha.length > 0 &&
      prodSha.length > 0 &&
      stagingSha.slice(0, 7) !== prodSha;

    return NextResponse.json({
      needsPromote,
      stagingSha: stagingSha.slice(0, 7),
      prodSha,
      prodDeployedAt,
      prodUrl: latestProd?.url ?? null,
    });
  } catch (error) {
    logger.error('[deploy/status] Failed to fetch production status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deploy status' },
      { status: 500 }
    );
  }
}
