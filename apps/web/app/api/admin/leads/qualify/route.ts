import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { leads } from '@/lib/db/schema/leads';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError, getSafeErrorMessage } from '@/lib/error-tracking';
import { processLeadBatch } from '@/lib/leads/process-batch';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/admin/leads/qualify — Trigger qualification for discovered leads.
 */
export async function POST() {
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
    const discoveredLeads = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.status, 'discovered'))
      .limit(100);

    if (discoveredLeads.length === 0) {
      return NextResponse.json(
        { message: 'No discovered leads to qualify', result: null },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    const leadIds = discoveredLeads.map(l => l.id);
    const result = await processLeadBatch(leadIds);

    return NextResponse.json(
      { message: 'Qualification complete', result },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Failed to qualify leads', error, {
      route: '/api/admin/leads/qualify',
    });
    return NextResponse.json(
      { error: getSafeErrorMessage(error, 'Failed to qualify leads') },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
