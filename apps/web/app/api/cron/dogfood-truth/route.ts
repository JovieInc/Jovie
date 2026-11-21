/**
 * Dogfood account truth probe (JOV-7140). Called daily by the
 * synthetic-monitoring `dogfood-truth` job with the cron bearer secret. Read
 * only: it reports findings and the job files or resolves one Linear issue
 * per finding key. 200 whenever the check ran; `ok` carries the verdict.
 */
import { NextResponse } from 'next/server';
import { type AccessPolicy, defineRoute } from '@/lib/api/route-pipeline';
import { verifyCronRequest } from '@/lib/cron/auth';
import { checkDesignPartnerAccountTruth } from '@/lib/dogfood/account-truth';
import { captureError } from '@/lib/error-tracking';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ROUTE = '/api/cron/dogfood-truth';

/** Cron-secret gate; the denial keeps verifyCronRequest's status and body. */
const cronAccess: AccessPolicy<null> = {
  name: 'cron',
  async authorize(request) {
    const failure = verifyCronRequest(request, { route: ROUTE });
    if (!failure) return { ok: true, auth: null };
    return { ok: false, status: failure.status, body: await failure.json() };
  },
};

export const GET = defineRoute(
  { route: ROUTE, access: cronAccess },
  async ({ responseHeaders }) => {
    try {
      const report = await checkDesignPartnerAccountTruth();
      return NextResponse.json(report, { headers: responseHeaders });
    } catch (error) {
      await captureError('Dogfood account truth probe failed', error, {
        feature: 'dogfood-truth',
      }).catch(() => undefined);
      return NextResponse.json(
        { ok: false, code: 'probe_failed' },
        { status: 503, headers: responseHeaders }
      );
    }
  }
);
