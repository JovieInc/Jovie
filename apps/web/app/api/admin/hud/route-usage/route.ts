import 'server-only';

import { NextResponse } from 'next/server';
import { getOvieOperatorEntitlements } from '@/lib/ovie/privacy-lock/access';
import { ovieRouteKey } from '@/lib/ovie/route-usage';
import {
  readOvieRouteUsage,
  recordOvieRouteView,
} from '@/lib/ovie/route-usage.server';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

async function denied() {
  const entitlements = await getOvieOperatorEntitlements({ purpose: 'read' });
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

/** POST { path }: count one view of an Ovie destination (route template only). */
export async function POST(request: Request): Promise<Response> {
  const refusal = await denied();
  if (refusal) return refusal;
  const body = (await request.json().catch(() => null)) as {
    path?: unknown;
  } | null;
  const key = ovieRouteKey(typeof body?.path === 'string' ? body.path : null);
  if (!key) {
    return NextResponse.json(
      { error: 'Not an Ovie route' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
  const recorded = await recordOvieRouteView(key);
  return NextResponse.json(
    { recorded },
    { status: recorded ? 200 : 202, headers: NO_STORE_HEADERS }
  );
}

/** GET ?days=30: views per route, most used first. */
export async function GET(request: Request): Promise<Response> {
  const refusal = await denied();
  if (refusal) return refusal;
  const days = Number(new URL(request.url).searchParams.get('days') ?? 30);
  const usage = await readOvieRouteUsage(Number.isFinite(days) ? days : 30);
  return NextResponse.json(usage, { headers: NO_STORE_HEADERS });
}
