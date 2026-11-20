/**
 * Public offer snapshot. Read by native clients and by the live offer-truth
 * check, which compares `hash` with the hash built into the commit under
 * verification and with Stripe. Static content: no user data.
 */
import { NextResponse } from 'next/server';
import { offerSnapshot } from '@/lib/billing/offer';

export const runtime = 'nodejs';

export function GET() {
  const snapshot = offerSnapshot();
  return NextResponse.json(snapshot, {
    headers: {
      'cache-control':
        'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
      'x-offer-hash': snapshot.hash,
      'x-offer-version': snapshot.version,
    },
  });
}
