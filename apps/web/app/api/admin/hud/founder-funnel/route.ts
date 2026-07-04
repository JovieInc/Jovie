import 'server-only';

import { NextResponse } from 'next/server';
import {
  type FounderFunnelData,
  type FounderFunnelTimeRange,
  getFounderFunnelData,
} from '@/lib/admin/founder-funnel';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export type FounderFunnelResponse = FounderFunnelData;

function parseRange(request: Request): FounderFunnelTimeRange {
  const { searchParams } = new URL(request.url);
  const rawRange = searchParams.get('range') ?? '30d';
  if (rawRange === '7d' || rawRange === 'all') return rawRange;
  return '30d';
}

async function authorizeAdmin(): Promise<Response | null> {
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
  return null;
}

/**
 * Founder conversion HUD funnel data (#11500). Admin-only.
 * `?range=7d|30d|all` (defaults to 30d).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const authResponse = await authorizeAdmin();
    if (authResponse) return authResponse;

    const funnel = await getFounderFunnelData(parseRange(request));
    return NextResponse.json(funnel, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    captureError('founder-funnel route failed', error);
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
