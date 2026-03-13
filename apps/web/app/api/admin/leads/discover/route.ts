import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { discoveryKeywords, leadPipelineSettings } from '@/lib/db/schema/leads';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError, getSafeErrorMessage } from '@/lib/error-tracking';
import { runDiscovery } from '@/lib/leads/discovery';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/admin/leads/discover — Manually trigger one discovery cycle.
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
    let [settings] = await db
      .select()
      .from(leadPipelineSettings)
      .where(eq(leadPipelineSettings.id, 1))
      .limit(1);

    if (!settings) {
      [settings] = await db
        .insert(leadPipelineSettings)
        .values({ id: 1 })
        .returning();
    }

    const keywords = await db.select().from(discoveryKeywords);

    if (keywords.length === 0) {
      return NextResponse.json(
        { error: 'No keywords configured. Add keywords first.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await runDiscovery(settings, keywords);

    return NextResponse.json(
      { result },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Failed to run manual discovery', error, {
      route: '/api/admin/leads/discover',
    });
    return NextResponse.json(
      { error: getSafeErrorMessage(error, 'Failed to run discovery') },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
