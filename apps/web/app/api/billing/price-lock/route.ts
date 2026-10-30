/**
 * Price lock quote API (Tim, 2026-10-29).
 *
 * The signed-in person's own price: the one every price surface, email and
 * agent/API quote for them must use instead of the current list price. The
 * lock is created on first need (source `first_view`), so a person who never
 * had one is locked to the list price they are shown now.
 */

import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { ensurePriceLockForUser } from '@/lib/billing/price-lock.server';
import { buildPriceLockView } from '@/lib/billing/price-lock-view';
import { captureCriticalError } from '@/lib/error-tracking';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET() {
  try {
    const { userId } = await getCachedAuth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    const lock = await ensurePriceLockForUser(userId, 'first_view');
    return NextResponse.json(
      { priceLock: buildPriceLockView(lock) },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureCriticalError('Price lock quote failed', error, {
      route: '/api/billing/price-lock',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Failed to load your price' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
