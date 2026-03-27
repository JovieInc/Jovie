import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError, getSafeErrorMessage } from '@/lib/error-tracking';
import { getLeadFunnelReport } from '@/lib/leads/reporting';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export const runtime = 'nodejs';

const filterSchema = z.object({
  start: z.coerce.date().optional(),
  end: z.coerce.date().optional(),
  sourcePlatform: z.enum(['linktree', 'beacons', 'laylo']).optional(),
  discoveryQuery: z.string().min(1).optional(),
  musicTool: z.string().min(1).optional(),
  verified: z
    .enum(['true', 'false'])
    .transform(value => value === 'true')
    .optional(),
  hasPaidTier: z
    .enum(['true', 'false'])
    .transform(value => value === 'true')
    .optional(),
  hasTrackingPixels: z
    .enum(['true', 'false'])
    .transform(value => value === 'true')
    .optional(),
  channel: z.string().min(1).optional(),
  campaignKey: z.string().min(1).optional(),
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

    const report = await getLeadFunnelReport(parsed.data);
    return NextResponse.json(report, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    await captureError('Failed to build lead funnel report', error, {
      route: '/api/admin/leads/funnel',
    });
    return NextResponse.json(
      {
        error: getSafeErrorMessage(error, 'Failed to build lead funnel report'),
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
