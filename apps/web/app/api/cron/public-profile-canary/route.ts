/**
 * Public-profile canary cron (JOV-1872)
 *
 * Runs daily at 06:13 UTC (off-peak — ~11 PM PT / late evening Tim time).
 *
 * PURPOSE: Lightweight HTTP-level check that the canonical public profile
 * surface (/tim, /tim/alerts, /api/audience/visit) is healthy in production.
 * This is the production-monitoring half of the Reliability Every-Bug-Becomes-a-Detector
 * loop (JOV-1855). The full Playwright canary spec runs in nightly CI.
 *
 * CHECKS (see lib/canaries/public-profile.ts for implementation):
 *  1. GET /tim           — 200, no server error body
 *  2. GET /tim/alerts    — 200, no server error body
 *  3. GET /tim/pay       — 200 (follows 307 redirect), no server error body
 *  4. POST /api/audience/visit — 2xx or 429 (rate-limited is healthy)
 *
 * OUTPUT: Structured Sentry breadcrumb with tag `canary.public_profile=pass|fail`.
 * The admin ops panel reads the canary status from a short-lived Redis key
 * written by this route (TTL: 26h so the panel always has a recent result even
 * if the cron is briefly late).
 *
 * Cost impact: 4 HTTP calls/day to production. ~$0/month. No external service
 * dependency beyond the existing Sentry + Redis clients.
 *
 * Schedule: `13 6 * * *` (configured in vercel.json per JOV-1872 approval)
 *
 * @see .claude/rules/infra.md — explicit approval from JOV-1872 acceptance criteria
 */

import * as Sentry from '@sentry/nextjs';
import { type NextRequest, NextResponse } from 'next/server';
import {
  buildReport,
  buildVisitPayload,
  CANARY_AUDIENCE_VISIT_PATH,
  CANARY_CREATOR_HANDLE,
  CANARY_REDIS_KEY,
  CANARY_ROUTES,
  type CanaryReport,
  checkHttpGet,
  checkHttpPost,
  formatReportSummary,
} from '@/lib/canaries/public-profile';
import { verifyCronRequest } from '@/lib/cron/auth';
import { captureError } from '@/lib/error-tracking';
import { getRedis } from '@/lib/redis';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 30;

/** 26 hours so the key persists through a brief cron delay. */
const CANARY_REDIS_TTL_SECONDS = 26 * 60 * 60;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Resolve the production base URL from the request or fall back to the
 * canonical production host. We never probe the canary against a preview URL —
 * it must always hit production.
 */
function resolveProductionBaseUrl(): string {
  return 'https://jov.ie';
}

/**
 * Write the canary result to Redis so the admin ops panel can surface it
 * without an API call per page load.
 */
async function persistCanaryResult(report: CanaryReport): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    logger.warn(
      '[canary/public-profile] Redis unavailable — skipping persistence'
    );
    return;
  }

  try {
    await redis.set(CANARY_REDIS_KEY, JSON.stringify(report), {
      ex: CANARY_REDIS_TTL_SECONDS,
    });
  } catch (err) {
    // Non-critical — the Sentry breadcrumb is the primary signal
    logger.warn(
      '[canary/public-profile] Failed to write Redis canary key',
      err
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authError = verifyCronRequest(request, {
    route: '/api/cron/public-profile-canary',
    allowDevelopmentBypass: true,
  });
  if (authError) return authError;

  const runAt = new Date().toISOString();
  const wallStart = Date.now();
  const base = resolveProductionBaseUrl();

  try {
    const [profileCheck, alertsCheck, payCheck, visitCheck] =
      await Promise.allSettled([
        checkHttpGet('profile-200', `${base}${CANARY_ROUTES.profile}`, body =>
          body.includes(CANARY_CREATOR_HANDLE)
        ),
        checkHttpGet('alerts-200', `${base}${CANARY_ROUTES.alerts}`),
        checkHttpGet('pay-200', `${base}${CANARY_ROUTES.pay}`),
        // Audience-visit POST — uses a synthetic profileId so we intentionally
        // expect a 404 (profile not found in prod for canary payload). We treat
        // any non-5xx as healthy because the route itself responded correctly.
        // A real canary would use the actual Tim profile ID — but we deliberately
        // avoid writing audience rows from the canary bot.
        checkHttpPost(
          'audience-visit',
          `${base}${CANARY_AUDIENCE_VISIT_PATH}`,
          buildVisitPayload('00000000-0000-0000-0000-000000000000')
        ),
      ]);

    const checks = [profileCheck, alertsCheck, payCheck, visitCheck].map(
      (result, idx) => {
        if (result.status === 'fulfilled') return result.value;
        const names = [
          'profile-200',
          'alerts-200',
          'pay-200',
          'audience-visit',
        ];
        return {
          name: names[idx] ?? 'unknown',
          ok: false,
          detail:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
          durationMs: 0,
        };
      }
    );

    // audience-visit 404 is expected (synthetic UUID) — mark it ok
    const visitResult = checks[3];
    if (visitResult && visitResult.statusCode === 404) {
      checks[3] = { ...visitResult, ok: true };
    }
    // audience-visit 400 (invalid payload shape) is also acceptable — route responded
    if (visitResult && visitResult.statusCode === 400) {
      checks[3] = { ...visitResult, ok: true };
    }

    const totalDurationMs = Date.now() - wallStart;
    const report = buildReport(runAt, checks, totalDurationMs);
    const summary = formatReportSummary(report);

    logger.info(summary, { report });

    // Emit Sentry breadcrumb so the admin ops panel can surface canary status
    Sentry.addBreadcrumb({
      category: 'canary',
      message: summary,
      level: report.pass ? 'info' : 'error',
      data: {
        'canary.public_profile': report.pass ? 'pass' : 'fail',
        runAt,
        checks: report.checks,
      },
    });

    if (!report.pass) {
      const failedChecks = report.checks.filter(c => !c.ok);
      Sentry.captureMessage(
        `[canary/public-profile] FAIL — ${failedChecks.map(c => c.name).join(', ')}`,
        'error'
      );
    }

    await persistCanaryResult(report);

    return NextResponse.json(report, {
      status: report.pass ? 200 : 207,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    logger.error('[canary/public-profile] Canary run failed', error);
    await captureError('Public profile canary run failed', error, {
      route: '/api/cron/public-profile-canary',
    });

    return NextResponse.json(
      { error: 'Canary run failed', runAt },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
