/** The signed-in person's own (locked) price; locks on first view if none. */

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
