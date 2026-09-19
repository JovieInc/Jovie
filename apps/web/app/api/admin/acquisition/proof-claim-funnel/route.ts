import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getProofClaimFunnelReport } from '@/lib/acquisition/proof-claim-funnel.server';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError, getSafeErrorMessage } from '@/lib/error-tracking';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const filterSchema = z.object({
  start: z.coerce.date().optional(),
  end: z.coerce.date().optional(),
});

export async function GET(request: NextRequest) {
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

  try {
    const parsed = filterSchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const report = await getProofClaimFunnelReport(parsed.data);
    return NextResponse.json(report, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    await captureError('Failed to build proof-claim funnel report', error, {
      route: '/api/admin/acquisition/proof-claim-funnel',
    });
    return NextResponse.json(
      {
        error: getSafeErrorMessage(
          error,
          'Failed to build proof-claim funnel report'
        ),
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
