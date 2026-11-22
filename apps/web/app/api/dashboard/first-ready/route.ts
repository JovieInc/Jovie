import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth, getCachedCurrentUser } from '@/lib/auth/cached';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
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

const accepted = () =>
  new NextResponse(null, { status: 204, headers: NO_STORE_HEADERS });

/**
 * Durable sink for time to fully loaded first dashboard
 * (first-dashboard-ready/v1). One beacon per hard shell load. Authentication
 * is the abuse boundary and supplies the reporting cohort, so synthetic and
 * test principals never count as customers; no identifier is stored.
 * Fire-and-forget: limiter and sink failures are acknowledged and dropped.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const rateLimit = await navigationTelemetryLimiter.limit(
    `first-dashboard:${userId}`
  );
  if (!rateLimit.success) return accepted();

  const body = await parseJsonBody(request, {
    route: ROUTE,
    maxBodySize: MAX_BODY_BYTES,
  });
  if (!body.ok) return body.response;

  const sample = sampleSchema.safeParse(body.data);
  if (!sample.success) {
    return NextResponse.json(
      { error: 'invalid_payload' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const user = await getCachedCurrentUser().catch(() => null);
  await trackServerEvent('first_dashboard_ready', {
    duration_ms: sample.data.durationMs,
    server_ms: sample.data.serverMs,
    document_ms: sample.data.documentMs,
    boot_ms: sample.data.bootMs,
    settle_ms: sample.data.settleMs,
    outcome: sample.data.outcome,
    new_account: sample.data.newAccount,
    cohort: getAccountMetricCohort(user?.primaryEmailAddress?.emailAddress),
  });
  return accepted();
}
