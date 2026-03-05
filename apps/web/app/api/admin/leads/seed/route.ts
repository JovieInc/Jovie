import { NextResponse } from 'next/server';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError, getSafeErrorMessage } from '@/lib/error-tracking';
import { seedFeatureFmKeywords } from '@/lib/leads/seed-keywords';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export const runtime = 'nodejs';

/**
 * POST /api/admin/leads/seed — Seed Feature.fm discovery keywords.
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
    const result = await seedFeatureFmKeywords();
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
