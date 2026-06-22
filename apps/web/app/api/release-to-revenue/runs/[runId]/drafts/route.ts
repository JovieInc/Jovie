import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { listDistributionDraftsForRun } from '@/lib/release-to-revenue/distribution-drafts';
import { logger } from '@/lib/utils/logger';

interface RouteParams {
  params: Promise<{ runId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { runId } = await params;
  const { userId, error } = await requireAuth();
  if (error) return error;

  try {
    const drafts = await listDistributionDraftsForRun({ runId, userId });
    if (!drafts) {
      return NextResponse.json(
        { error: 'not-found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { ok: true, drafts },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    logger.error('[release-to-revenue/drafts] list failed', err);
    await captureError('release-to-revenue drafts list failed', err, {
      route: '/api/release-to-revenue/runs/[runId]/drafts',
      runId,
    });
    return NextResponse.json(
      { error: 'internal-error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
