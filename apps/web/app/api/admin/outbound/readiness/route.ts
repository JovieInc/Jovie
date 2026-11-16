import { NextResponse } from 'next/server';
import { operatorAccess } from '@/lib/api/route-access';
import { defineRoute } from '@/lib/api/route-pipeline';
import { getOutboundReadiness } from '@/lib/outbound/readiness.server';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/** GET /api/admin/outbound/readiness — what is left before onboarding artists. */
async function getHandler() {
  return NextResponse.json(await getOutboundReadiness(), {
    headers: NO_STORE_HEADERS,
  });
}

export const GET = defineRoute(
  {
    route: '/api/admin/outbound/readiness',
    access: operatorAccess({ purpose: 'read' }),
    legacy: { cache: 'pipeline-responses-only', unhandledErrors: 'rethrow' },
  },
  getHandler
);
