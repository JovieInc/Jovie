import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getProofClaimFunnelReport } from '@/lib/acquisition/proof-claim-funnel.server';
import {
  type OperatorRouteInput,
  operatorAccess,
} from '@/lib/api/route-access';
import { defineRoute } from '@/lib/api/route-pipeline';
import { captureError, getSafeErrorMessage } from '@/lib/error-tracking';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const filterSchema = z.object({
  start: z.coerce.date().optional(),
  end: z.coerce.date().optional(),
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

export const GET = defineRoute(
  {
    route: '/api/admin/acquisition/proof-claim-funnel',
    access: operatorAccess({ purpose: 'read' }),
    legacy: { cache: 'pipeline-responses-only', unhandledErrors: 'rethrow' },
  },
  getHandler
);
