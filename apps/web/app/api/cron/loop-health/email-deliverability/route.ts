/**
 * Email deliverability metrics for the closed-loop health workflow
 * (.github/workflows/loop-health-email-deliverability.yml).
 *
 * Returns aggregate Resend bounce, complaint and sign-in delivery latency
 * numbers over a rolling 7-day window. The workflow evaluates thresholds and
 * files or resolves the Linear issue; this route only measures. Counts only:
 * no addresses, message ids or bodies. One grouped query plus one join over an
 * indexed 7-day window, run on the workflow's 6-hour clock.
 */
import { NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cron/auth';
import { captureError } from '@/lib/error-tracking';
import { loadEmailDeliverabilityMetrics } from '@/lib/loop-health/email-deliverability';

export const runtime = 'nodejs';
export const maxDuration = 30;

const ROUTE = '/api/cron/loop-health/email-deliverability';
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET(request: Request): Promise<NextResponse> {
  const authError = verifyCronRequest(request, {
    route: ROUTE,
    allowDevelopmentBypass: true,
    requireTrustedOrigin: true,
  });
  if (authError) return authError;

  try {
    const metrics = await loadEmailDeliverabilityMetrics();
    return NextResponse.json(
      { checkedAt: new Date().toISOString(), ...metrics },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Email deliverability metrics failed', error, {
      route: ROUTE,
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'email_deliverability_unavailable' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
