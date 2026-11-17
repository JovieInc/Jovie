import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { operatorAccess } from '@/lib/api/route-access';
import { defineRoute } from '@/lib/api/route-pipeline';
import { db } from '@/lib/db';
import { discoveryKeywords, leadPipelineSettings } from '@/lib/db/schema/leads';
import { captureError, getSafeErrorMessage } from '@/lib/error-tracking';
import { resetBudgetIfNeeded, runDiscovery } from '@/lib/leads/discovery';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/admin/leads/discover — Manually trigger one discovery cycle.
 * Returns full per-keyword diagnostics so the UI can show search health.
 */
async function postHandler() {
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

    // Reset daily query budget if past reset time (or never initialized)
    settings = await resetBudgetIfNeeded(settings);

    const keywords = await db.select().from(discoveryKeywords);

    if (keywords.length === 0) {
      return NextResponse.json(
        { error: 'No keywords configured. Add keywords first.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const enabledKeywords = keywords.filter(k => k.enabled);
    if (enabledKeywords.length === 0) {
      return NextResponse.json(
        { error: 'All keywords are disabled. Enable at least one.' },
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

export const POST = defineRoute(
  {
    route: '/api/admin/leads/discover',
    access: operatorAccess({ session: 'fresh' }),
    legacy: { cache: 'pipeline-responses-only', unhandledErrors: 'rethrow' },
  },
  postHandler
);
