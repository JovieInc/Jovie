/**
 * Billing health metrics for the closed-loop workflow
 * (.github/workflows/loop-health-billing-health.yml). Measures only: failed
 * payment rate, dunning recovery rate and stalled dunning from stored Stripe
 * webhook events. Counts and rates, no customer or invoice ids. One bounded
 * (5000 row) select over a 30-day indexed window on the loop's 6-hour clock.
 */
import { NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cron/auth';
import { captureError } from '@/lib/error-tracking';
import { loadBillingHealthMetrics } from '@/lib/loop-health/billing-health';

export const runtime = 'nodejs';
export const maxDuration = 30;

const ROUTE = '/api/cron/loop-health/billing-health';
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET(request: Request): Promise<NextResponse> {
  const authError = verifyCronRequest(request, {
    route: ROUTE,
    allowDevelopmentBypass: true,
    requireTrustedOrigin: true,
  });
  if (authError) return authError;

  try {
    const metrics = await loadBillingHealthMetrics();
    return NextResponse.json(
      { checkedAt: new Date().toISOString(), ...metrics },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Billing health metrics failed', error, {
      route: ROUTE,
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'billing_health_unavailable' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
