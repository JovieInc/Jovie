import { NextResponse } from 'next/server';
import { z } from 'zod';
import { defineRoute } from '@/lib/api/route-pipeline';
import { signedInAccess } from '@/lib/api/signed-in-access';
import { getCachedCurrentUser } from '@/lib/auth/cached';
import { FIRST_DASHBOARD_READY_TIMEOUT_MS } from '@/lib/monitoring/first-dashboard-ready';
import { navigationTelemetryLimiter } from '@/lib/rate-limit';
import { trackServerEvent } from '@/lib/server-analytics';
import { getAccountMetricCohort } from '@/lib/utils/email';

const ROUTE = '/api/dashboard/first-ready';
const MAX_BODY_BYTES = 512;
// A timed-out load reports the timeout plus one frame of slack.
const MAX_MS = FIRST_DASHBOARD_READY_TIMEOUT_MS + 1_000;

const ms = z.number().int().min(0).max(MAX_MS);

const sampleSchema = z
  .object({
    durationMs: ms,
    serverMs: ms,
    documentMs: ms,
    bootMs: ms,
    settleMs: ms,
    outcome: z.enum(['reached', 'dropped']),
    newAccount: z.boolean(),
  })
  .strict();

const accepted = (headers: Readonly<Record<string, string>>) =>
  new NextResponse(null, { status: 204, headers });

/**
 * Durable sink for time to fully loaded first dashboard
 * (first-dashboard-ready/v1). One beacon per hard shell load. Authentication
 * is the abuse boundary and supplies the reporting cohort, so synthetic and
 * test principals never count as customers; no identifier is stored.
 * Fire-and-forget: a rate-limited sample is acknowledged and dropped.
 */
export const POST = defineRoute(
  {
    route: ROUTE,
    access: signedInAccess(),
    rateLimit: async ({ auth, responseHeaders }) => {
      const result = await navigationTelemetryLimiter.limit(
        `first-dashboard:${auth.userId}`
      );
      return result.success ? null : accepted(responseHeaders);
    },
    body: { schema: sampleSchema, maxBodySize: MAX_BODY_BYTES },
  },
  async ({ body, responseHeaders }) => {
    const user = await getCachedCurrentUser().catch(() => null);
    await trackServerEvent('first_dashboard_ready', {
      duration_ms: body.durationMs,
      server_ms: body.serverMs,
      document_ms: body.documentMs,
      boot_ms: body.bootMs,
      settle_ms: body.settleMs,
      outcome: body.outcome,
      new_account: body.newAccount,
      cohort: getAccountMetricCohort(user?.primaryEmailAddress?.emailAddress),
    });
    return accepted(responseHeaders);
  }
);
