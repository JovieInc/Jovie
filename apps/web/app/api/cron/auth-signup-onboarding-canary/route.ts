/**
 * Auth / signup / onboarding golden-path canary cron (JOV-1871)
 *
 * Runs daily at 06:23 UTC (off-peak — 10 minutes after public-profile canary).
 *
 * PURPOSE: Lightweight HTTP-level check that the anonymous auth + onboarding
 * golden-path entrypoints are healthy in production:
 *  - GET /signup, /signin — auth shell renders without config errors
 *  - GET /start — onboarding chat surface renders
 *  - POST /api/chat (onboarding mode) — reaches Turnstile gate, not disabled
 *
 * This is the production-monitoring half of the Reliability Every-Bug-Becomes-a-Detector
 * loop (JOV-1855). The full Playwright canary spec runs in nightly CI.
 *
 * OUTPUT: Structured Sentry breadcrumb with tag `canary.auth_signup_onboarding=pass|fail`.
 * The admin ops panel reads the canary status from a short-lived Redis key
 * written by this route (TTL: 26h).
 *
 * Cost impact: 4 HTTP calls/day to production. ~$0/month.
 *
 * Schedule: `23 6 * * *` (configured in vercel.json per JOV-1871 approval)
 *
 * @see .claude/rules/infra.md — explicit approval from JOV-1871 acceptance criteria
 */

import * as Sentry from '@sentry/nextjs';
import { type NextRequest, NextResponse } from 'next/server';
import {
  AUTH_SIGNUP_ONBOARDING_CANARY_REDIS_KEY,
  AUTH_SIGNUP_ONBOARDING_ROUTES,
  bodyContainsAuthShellReady,
  bodyContainsInitializedInterview,
  buildReport,
  type CanaryReport,
  checkAuthSurfaceGet,
  checkOnboardingChatProbe,
  formatAuthSignupOnboardingReportSummary,
} from '@/lib/canaries/auth-signup-onboarding';
import { verifyCronRequest } from '@/lib/cron/auth';
import { captureError } from '@/lib/error-tracking';
import { getRedis } from '@/lib/redis';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 30;

/** 26 hours so the key persists through a brief cron delay. */
const CANARY_REDIS_TTL_SECONDS = 26 * 60 * 60;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function resolveProductionBaseUrl(): string {
  return 'https://jov.ie';
}

async function persistCanaryResult(report: CanaryReport): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    logger.warn(
      '[canary/auth-signup-onboarding] Redis unavailable — skipping persistence'
    );
    return;
  }

  try {
    await redis.set(
      AUTH_SIGNUP_ONBOARDING_CANARY_REDIS_KEY,
      JSON.stringify(report),
      {
        ex: CANARY_REDIS_TTL_SECONDS,
      }
    );
  } catch (err) {
    logger.warn(
      '[canary/auth-signup-onboarding] Failed to write Redis canary key',
      err
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authError = verifyCronRequest(request, {
    route: '/api/cron/auth-signup-onboarding-canary',
    allowDevelopmentBypass: true,
  });
  if (authError) return authError;

  const runAt = new Date().toISOString();
  const wallStart = Date.now();
  const base = resolveProductionBaseUrl();

  try {
    const [signupCheck, signinCheck, startCheck, chatCheck] =
      await Promise.allSettled([
        checkAuthSurfaceGet(
          'signup-200',
          `${base}${AUTH_SIGNUP_ONBOARDING_ROUTES.signup}`,
          bodyContainsAuthShellReady
        ),
        checkAuthSurfaceGet(
          'signin-200',
          `${base}${AUTH_SIGNUP_ONBOARDING_ROUTES.signin}`,
          bodyContainsAuthShellReady
        ),
        checkAuthSurfaceGet(
          'start-200',
          `${base}${AUTH_SIGNUP_ONBOARDING_ROUTES.start}`,
          // Robust primary signal: the interview must initialize (starter
          // intro / composer present), not merely render the chat container.
          bodyContainsInitializedInterview
        ),
        checkOnboardingChatProbe(
          'onboarding-chat-gate',
          `${base}${AUTH_SIGNUP_ONBOARDING_ROUTES.onboardingChat}`
        ),
      ]);

    const checks = [signupCheck, signinCheck, startCheck, chatCheck].map(
      (result, idx) => {
        if (result.status === 'fulfilled') return result.value;
        const names = [
          'signup-200',
          'signin-200',
          'start-200',
          'onboarding-chat-gate',
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

    const totalDurationMs = Date.now() - wallStart;
    const report = buildReport(runAt, checks, totalDurationMs);
    const summary = formatAuthSignupOnboardingReportSummary(report);

    logger.info(summary, { report });

    Sentry.addBreadcrumb({
      category: 'canary',
      message: summary,
      level: report.pass ? 'info' : 'error',
      data: {
        'canary.auth_signup_onboarding': report.pass ? 'pass' : 'fail',
        runAt,
        checks: report.checks,
      },
    });

    if (!report.pass) {
      const failedChecks = report.checks.filter(c => !c.ok);
      Sentry.captureMessage(
        `[canary/auth-signup-onboarding] FAIL — ${failedChecks.map(c => c.name).join(', ')}`,
        'error'
      );
    }

    await persistCanaryResult(report);

    return NextResponse.json(report, {
      status: report.pass ? 200 : 207,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    logger.error('[canary/auth-signup-onboarding] Canary run failed', error);
    await captureError('Auth signup onboarding canary run failed', error, {
      route: '/api/cron/auth-signup-onboarding-canary',
    });

    return NextResponse.json(
      { error: 'Canary run failed', runAt },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
