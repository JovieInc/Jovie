import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { loadOutreachEngineStatus } from '@/lib/outbound/cold/engine.server';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';

export const runtime = 'nodejs';

/**
 * Outreach engine status for Summer: edit-learning metrics and auto-approve
 * verdicts per segment, the cold send controller's plan and blockers, and
 * the outreach funnel with stage dwell. No recipient data.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!(await verifySummerOidcRequest(request))) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  try {
    return NextResponse.json(await loadOutreachEngineStatus(), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    await captureError('Outreach engine read failed', error);
    return NextResponse.json(
      { error: 'Outreach engine unavailable' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
