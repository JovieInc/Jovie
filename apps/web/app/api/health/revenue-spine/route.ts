import { NextResponse } from 'next/server';
import { getDeployedBuildInfo } from '@/lib/observability/build-info';
import {
  buildRevenueSpineFailure,
  REVENUE_SPINE_STAGES,
} from '@/lib/observability/revenue-spine';

export const runtime = 'nodejs';

/**
 * Public runtime receipt for the revenue-spine failure contract (JOV-8249).
 *
 * Like `/api/health/build-info` (JOV-1958) this is a public production
 * identity receipt: never edge- or browser-cached, because a stale receipt
 * after promote would be a false production proof. Keep CDN + browser
 * directives aligned with the next.config.js `/api/health/*` header block.
 */
const RECEIPT_CACHE_HEADERS = {
  'cache-control': 'private, no-cache, no-store, must-revalidate',
  'cdn-cache-control': 'no-store',
  'vercel-cdn-cache-control': 'no-store',
  pragma: 'no-cache',
  expires: '0',
} as const;

export const REVENUE_SPINE_RECEIPT_SCHEMA = 'revenue-spine.emission-receipt/v1';

/**
 * Executes the real contract builder for every revenue-spine stage inside the
 * serving process, through the real error classifier, and publishes the
 * resulting events: read-only proof that all nine revenue-spine failure
 * paths share one live contract in production.
 *
 * Deliberately does NOT call `captureRevenueSpineFailure`: a synthetic probe
 * must not mint production failure issues in Sentry. The delivery pipeline
 * is proven against the real @sentry/node SDK in
 * `apps/web/lib/observability/revenue-spine.test.ts`, and the per-path
 * call-site wiring is locked by the colocated suites (auth, session,
 * claim-profile, onboarding errors, customer-sync, checkout, webhooks,
 * entitlements, gate).
 */
function buildStageReceipts() {
  const probe = Object.assign(new Error('revenue spine emission probe'), {
    code: 'ETIMEDOUT',
  });
  return REVENUE_SPINE_STAGES.map(stage =>
    buildRevenueSpineFailure({ stage, severity: 'unknown', error: probe })
  );
}

export async function GET() {
  try {
    const build = await getDeployedBuildInfo();
    return NextResponse.json(
      {
        schema: REVENUE_SPINE_RECEIPT_SCHEMA,
        contract: 'revenue-spine-failure/v1',
        commitSha: build.commitSha,
        deploymentId: build.deploymentId,
        environment: build.environment,
        generatedAt: new Date().toISOString(),
        stages: buildStageReceipts(),
      },
      { headers: RECEIPT_CACHE_HEADERS }
    );
  } catch {
    // Fail visibly rather than serve a receipt the serving build cannot
    // produce (JOV-5403: never claim runtime proof the code cannot emit).
    return NextResponse.json(
      { error: 'revenue_spine_receipt_unavailable' },
      { status: 503, headers: RECEIPT_CACHE_HEADERS }
    );
  }
}
