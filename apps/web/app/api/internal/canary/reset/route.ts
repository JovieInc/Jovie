import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cron/auth';
import { env } from '@/lib/env-server';
import { createRateLimiter } from '@/lib/rate-limit';
import { executeCanaryReset } from '@/lib/synthetic/canary-reset.server';
import { PASSAGE_TOKEN_SCOPE_CANARY_RESET } from '@/lib/synthetic/passage-token';
import { resolveSyntheticPassageTokenDetailed } from '@/lib/synthetic/passage-token.server';

/**
 * Canary-only reset to pre-claim state (JOV-9826).
 *
 * POST /api/internal/canary/reset returns the fixed claim-walk canary
 * (`browse-ready+synthetic-prodcert-claim@jov.ie`, reserved handle
 * `jovie-prodcert-claim`) to its exact pre-claim state, so the production
 * certification can walk a real claim + onboarding without publishing a
 * public profile per run.
 *
 * Authorization, in order, all fail closed:
 *   1. production kill switch (`SYNTHETIC_PASSAGE_TOKENS_DISABLED=1`,
 *      the same switch that stops every canary passage token) → 503;
 *   2. `CRON_SECRET` bearer (timing-safe) → 401;
 *   3. a 30/hour Redis-backed fixed-window budget for account resets,
 *      charged BEFORE any single-use passage token is consumed, fail
 *      closed without Redis → 429;
 *   4. a single-use `jsp1` passage token with the `canary_reset` scope,
 *      minted in CI from a key derived from CRON_SECRET, consumed in Redis
 *      with replay protection — grant-budget exhaustion is a NAMED 429
 *      (never an opaque 401), anything else → 401.
 *
 * The endpoint refuses every account whose email is not the exact canary
 * address; the reset itself deletes only rows owned by that user id and
 * logs every reset tagged internal. See `canary-reset-plan.ts` for the
 * exact reset semantics.
 */

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Route-local limiter (the sms-intents route pattern): hourly budget across
 * all runs, Redis-backed. Fail closed without Redis: requireRedis at both the
 * config and the limiter level means an unavailable store denies, never
 * degrades to memory, because this endpoint mutates accounts.
 *
 * 30/hour (JOV-9826, was 6): each green postdeploy walk spends 2 (start +
 * teardown reset) and each failed Playwright attempt spends 1, and main
 * moving several times an hour re-runs the walk per deploy — the worst
 * observed cadence (Nov 24 04:46–04:59Z: five probe runs in 13 minutes)
 * burned 15/h red / would burn ≈12/h green, so 6/h starved the walk by
 * construction. The budget still bounds only resets of the ONE fixed
 * claim-walk canary account; every other gate (bearer, single-use scoped
 * passage token, kill switch) is unchanged.
 *
 * Supersedes #26888 (merged 207e258d), which sized this 6→12 aligned to the
 * then-shared 12/h passage-grant allowance on the theory that allowance
 * was the walk's ceiling. It was the ceiling only because the walk shared
 * the visitor bucket; #26885 gives canary-walk scopes (`canary_reset`,
 * `canary_checkout`) a dedicated 30/h passage-grant limiter
 * (`synthetic_passage_canary_walk`, see `passage-token.server.ts`), so the
 * shared 12/h no longer ceilings this route and the 12 sizing is obsolete.
 */
const canaryResetLimiter = createRateLimiter(
  {
    name: 'Canary Reset',
    limit: 30,
    window: '1 h',
    prefix: 'canary_reset',
    requireRedis: true,
    analytics: false,
    algorithm: 'fixed-window',
    trafficClass: 'internal',
  },
  { requireRedis: true }
);

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Production kill switch: a one-way off switch, checked first so a
  // misbehaving run cannot spend any further authorization work.
  if (env.SYNTHETIC_PASSAGE_TOKENS_DISABLED === '1') {
    return json({ error: 'Canary reset is disabled' }, 503);
  }

  // 2. CRON_SECRET bearer — holding it already implies production cron
  // authority; the passage token narrows it to this one canary action.
  const cronFailure = verifyCronRequest(request, {
    route: '/api/internal/canary/reset',
  });
  if (cronFailure) return cronFailure;

  // 3. Dedicated hourly budget for account resets, charged BEFORE the
  // single-use passage token is consumed (JOV-9826, red 45350750159): a
  // budget-denied hour must burn this window only — never also the
  // passage-grant budget, whose denial previously surfaced as the opaque
  // 401 below and read as auth contract drift. The bearer check above
  // already limits who can reach this charge to cron authority holders.
  const rate = await canaryResetLimiter.limit('canary-reset');
  if (!rate.success) {
    // The public response remains deliberately indistinguishable. Record only
    // the provider-independent reason; metrics must not change the denial.
    try {
      Sentry.metrics?.count('synthetic.canary_reset.denied', 1, {
        attributes: {
          reason:
            rate.unavailable === true
              ? 'limiter_unavailable'
              : 'budget_exhausted',
        },
      });
    } catch {
      // A telemetry failure cannot replace the original fail-closed 429.
    }
    return json({ error: 'Canary reset rate limit exceeded' }, 429);
  }

  // 4. Single-use scoped passage token (signature, TTL, scope, canary
  // binding, jti replay guard, and its own grant budget inside). A
  // grant-budget exhaustion is a NAMED 429 so the cert red says "shared
  // hourly budget", not auth drift (JOV-9826); every other denial stays
  // the indistinguishable 401.
  const { grant, denyCause } = await resolveSyntheticPassageTokenDetailed(
    request.headers,
    PASSAGE_TOKEN_SCOPE_CANARY_RESET,
    {
      consume: true,
      requestId: request.headers.get('x-request-id') ?? undefined,
    }
  );
  if (denyCause === 'rate_limited') {
    try {
      Sentry.metrics?.count('synthetic.canary_reset.denied', 1, {
        attributes: { reason: 'passage_budget_exhausted' },
      });
    } catch {
      // A telemetry failure cannot replace the original fail-closed 429.
    }
    return json(
      {
        error:
          'Canary passage budget exhausted (shared hourly canary-walk grants); retry after the window clears',
      },
      429
    );
  }
  if (!grant) {
    return json({ error: 'Valid canary passage token required' }, 401);
  }

  const outcome = await executeCanaryReset();
  if (!outcome.ok) {
    return json(
      { error: 'Canary account is not provisioned for this environment' },
      409
    );
  }
  return json(
    {
      reset: 'completed',
      run: grant.claims.run,
      summary: outcome.summary,
    },
    200
  );
}

export async function GET() {
  return json({ error: 'Method not allowed' }, 405);
}
