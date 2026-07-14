import 'server-only';

import { NextResponse } from 'next/server';
import { listVisualQaReviewRuns } from '@/lib/agent-os/visual-qa/review';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET(): Promise<Response> {
  try {
    const entitlements = await getCurrentUserEntitlements();
    if (!entitlements.isAuthenticated) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    if (!entitlements.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const runs = await listVisualQaReviewRuns();

    return NextResponse.json(
      { runs, fetchedAt: new Date().toISOString() },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('[api/admin/hud/visual-qa] Failed to list runs', error);
    await captureError('Visual QA HUD runs fetch failed', error, {
      route: '/api/admin/hud/visual-qa',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Failed to fetch Visual QA runs' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
