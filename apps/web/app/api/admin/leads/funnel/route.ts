import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  type OperatorRouteInput,
  operatorAccess,
} from '@/lib/api/route-access';
import { defineRoute } from '@/lib/api/route-pipeline';
import { captureError, getSafeErrorMessage } from '@/lib/error-tracking';
import { getLeadFunnelReport } from '@/lib/leads/reporting';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

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

async function getHandler({ request }: OperatorRouteInput) {
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

export const GET = defineRoute(
  {
    route: '/api/admin/leads/funnel',
    access: operatorAccess({ purpose: 'read' }),
    legacy: { cache: 'pipeline-responses-only', unhandledErrors: 'rethrow' },
  },
  getHandler
);
