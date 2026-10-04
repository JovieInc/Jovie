import { NextResponse } from 'next/server';
import { unknownAcquisitionEligibility } from '@/lib/acquisition/eligibility';
import { getAcquisitionEligibility } from '@/lib/acquisition/eligibility.server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * ACQUISITION_ELIGIBLE for Summer and other growth planners (JOV-7696): the
 * derived $199-cone predicate, its per-receipt explanations, the first
 * blocking receipt with its owner and next action, and the current founder
 * funnel counts. Planners read this before recommending outbound acquisition.
 * `?fresh=1` skips the 10-minute probe cache.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!(await verifySummerOidcRequest(request))) {
    return NextResponse.json(
      { error: 'unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  const fresh = new URL(request.url).searchParams.get('fresh') === '1';
  try {
    return NextResponse.json(await getAcquisitionEligibility({ fresh }), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    await captureError('Acquisition eligibility read failed', error, {
      route: '/api/internal/ovie/summer-company/acquisition-eligibility',
    });
    // Fail closed with a readable verdict rather than an error a planner
    // might treat as "no gate".
    return NextResponse.json(
      {
        ...unknownAcquisitionEligibility(
          new Date(),
          'Acquisition eligibility could not be computed.'
        ),
        funnel: null,
      },
      { headers: NO_STORE_HEADERS }
    );
  }
}
