import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { approveDistributionDraft } from '@/lib/release-to-revenue/distribution-drafts';
import { logger } from '@/lib/utils/logger';

interface RouteParams {
  params: Promise<{ runId: string; draftId: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  const { runId, draftId } = await params;
  const { userId, error } = await requireAuth();
  if (error) return error;

  try {
    const result = await approveDistributionDraft({ runId, draftId, userId });
    if (!result.ok) {
      const status =
        result.code === 'not-found' || result.code === 'draft-not-found'
          ? 404
          : result.code === 'already-decided'
            ? 409
            : 400;

      return NextResponse.json(
        { error: result.code },
        { status, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        draft: result.draft,
        runStatus: result.runStatus,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    logger.error('[release-to-revenue/drafts/approve] failed', err);
    await captureError('release-to-revenue draft approve failed', err, {
      route: '/api/release-to-revenue/runs/[runId]/drafts/[draftId]/approve',
      runId,
      draftId,
    });
    return NextResponse.json(
      { error: 'internal-error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
