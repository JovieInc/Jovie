import { NextResponse } from 'next/server';
import { operatorAccess } from '@/lib/api/route-access';
import { defineRoute } from '@/lib/api/route-pipeline';
import { captureError, getSafeErrorMessage } from '@/lib/error-tracking';
import { seedDiscoveryKeywords } from '@/lib/leads/seed-keywords';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export const runtime = 'nodejs';

/**
 * POST /api/admin/leads/seed — Seed Feature.fm and tool-search discovery keywords.
 */
async function postHandler() {
  try {
    const result = await seedDiscoveryKeywords();
    return NextResponse.json(
      { result },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Failed to seed keywords', error, {
      route: '/api/admin/leads/seed',
    });
    return NextResponse.json(
      { error: getSafeErrorMessage(error, 'Failed to seed keywords') },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export const POST = defineRoute(
  {
    route: '/api/admin/leads/seed',
    access: operatorAccess({ session: 'fresh' }),
    legacy: { cache: 'pipeline-responses-only', unhandledErrors: 'rethrow' },
  },
  postHandler
);
