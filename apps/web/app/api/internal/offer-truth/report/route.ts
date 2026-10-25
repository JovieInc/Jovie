/**
 * Receiver for offer-truth live check results (POST, CRON_SECRET bearer).
 * `fail` turns the offer guard strict immediately (fixed templates); `pass`
 * turns it off; `uncertified` (nothing failed, something could not be
 * certified) also turns it off; `unavailable` counts a strike and alerts on
 * the third in a row (logged override: deploys are not blocked by an outage).
 * A moved offer hash revalidates the static offer pages.
 */
import * as Sentry from '@sentry/nextjs';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { noteOfferHash } from '@/lib/billing/offer/hash-seen';
import { setOfferGuardStrict } from '@/lib/billing/offer/kill-switch';
import { noteCheckUnavailable } from '@/lib/billing/offer/strikes';
import { verifyCronRequest } from '@/lib/cron/auth';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Static pages that render the offer; revalidated when the served offer hash moves. */
const OFFER_PATHS = ['/', '/pricing', '/claim'] as const;

const VERDICTS = ['pass', 'fail', 'unavailable', 'uncertified'] as const;

export async function POST(request: Request): Promise<NextResponse> {
  const authError = verifyCronRequest(request, {
    route: '/api/internal/offer-truth/report',
    requireTrustedOrigin: true,
  });
  if (authError) return authError;

  const body = (await request.json().catch(() => null)) as {
    verdict?: string;
    failing?: string[];
    offerHash?: string;
  } | null;
  const verdict = VERDICTS.find(v => v === body?.verdict);
  if (!verdict) {
    return NextResponse.json(
      { error: 'verdict required' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (verdict === 'unavailable') {
    await noteCheckUnavailable(body?.failing ?? []);
  } else {
    await noteCheckUnavailable(null);
  }
  if (body?.offerHash && (await noteOfferHash(body.offerHash))) {
    for (const path of OFFER_PATHS) revalidatePath(path);
  }

  if (verdict === 'fail') {
    await setOfferGuardStrict(true);
    Sentry.captureMessage(
      'Offer truth mismatch: chat switched to fixed templates',
      {
        level: 'fatal',
        tags: { event: 'offer_truth_mismatch' },
        extra: {
          failing: (body?.failing ?? []).slice(0, 20),
          offerHash: body?.offerHash,
        },
        fingerprint: ['offer_truth_mismatch'],
      }
    );
  } else if (verdict === 'pass' || verdict === 'uncertified') {
    await setOfferGuardStrict(false);
  }
  return NextResponse.json(
    {
      ok: true,
      verdict,
      strict:
        verdict === 'fail'
          ? true
          : verdict === 'pass' || verdict === 'uncertified'
            ? false
            : null,
    },
    { headers: NO_STORE_HEADERS }
  );
}
