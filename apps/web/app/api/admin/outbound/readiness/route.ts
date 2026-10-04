import { NextResponse } from 'next/server';
import { getOutboundReadiness } from '@/lib/outbound/readiness.server';
import { getOvieOperatorEntitlements } from '@/lib/ovie/privacy-lock/access';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/** GET /api/admin/outbound/readiness — what is left before onboarding artists. */
export async function GET() {
  const entitlements = await getOvieOperatorEntitlements({ purpose: 'read' });
  if (!entitlements.isAuthenticated)
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  if (!entitlements.isAdmin)
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  return NextResponse.json(await getOutboundReadiness(), {
    headers: NO_STORE_HEADERS,
  });
}
