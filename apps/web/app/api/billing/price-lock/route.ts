/** The signed-in person's own (locked) price; locks on first view if none. */

import { NextResponse } from 'next/server';
import { defineRoute } from '@/lib/api/route-pipeline';
import {
  type SignedInRouteInput,
  signedInAccess,
} from '@/lib/api/signed-in-access';
import { ensurePriceLockForUser } from '@/lib/billing/price-lock.server';
import { buildPriceLockView } from '@/lib/billing/price-lock-view';
import { captureCriticalError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

const ROUTE = '/api/billing/price-lock';

export const GET = defineRoute(
  { route: ROUTE, access: signedInAccess() },
  async ({ auth }: SignedInRouteInput) => {
    try {
      const lock = await ensurePriceLockForUser(auth.userId, 'first_view');
      return NextResponse.json(
        { priceLock: buildPriceLockView(lock) },
        { headers: NO_STORE_HEADERS }
      );
    } catch (error) {
      await captureCriticalError('Price lock quote failed', error, {
        route: ROUTE,
        method: 'GET',
      });
      return NextResponse.json(
        { error: 'Failed to load your price' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }
  }
);
