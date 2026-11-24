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
 *   3. a single-use `jsp1` passage token with the `canary_reset` scope,
 *      minted in CI from a key derived from CRON_SECRET, consumed in Redis
 *      with replay protection — grant-budget exhaustion is a NAMED 429
 *      (never an opaque 401), anything else → 401;
 *   4. a 12/hour Redis-backed fixed-window budget for account resets,
 *      keyed PER RUN TAG (the verified token's `run` claim) and charged
 *      after the grant, fail closed without Redis → 429. Per-run keying is
 *      the structural fix for red 45366385483 (first walk after #26888
 *      merged: auth passed, all three attempts died `429 Canary reset rate
 *      limit exceeded`): the prior GLOBAL `canary-reset` key was shared by
 *      every probe run, every Playwright retry and every red loop, so
 *      deploy storms exhausted ANY fixed global size — 6/h starved the
 *      walk (45350243078/45350750159 era) and the 12/h interim tripped on
 *      the first post-merge walk. A single walk's retries can now never be
 *      denied by another run's consumption; the cross-run ceiling is the
 *      shared 30/h walk-grant budget (the named 429 in step 3).
 *
 * The endpoint refuses every account whose email is not the exact canary
 * address; the reset itself deletes only rows owned by that user id and
 * logs every reset tagged internal. See `canary-reset-plan.ts` for the
 * exact reset semantics.
 */

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Route-local limiter (the sms-intents route pattern): Redis-backed,
 * fail closed without Redis (requireRedis at both the config and the
 * limiter level — an unavailable store denies, never degrades to memory,
 * because this endpoint mutates accounts).
 *
 * PER-RUN keying (JOV-9826, red 45366385483): the key is
 * `canary-reset:<run tag>` taken from the VERIFIED passage token's `run`
 * claim, 12/hour per run tag. The prior global `canary-reset` key was
 * shared by every probe run, every Playwright retry and every red loop,
 * so deploy storms exhausted any fixed global size — 6/h starved the walk
 * (45350243078/45350750159 era) and the 12/h interim (#26888, merged
 * 207e258d) tripped on the first walk after it merged. Per-run keying
 * makes the guarantee structural: a single walk's own retries can never
 * be denied by another run's consumption. 12 covers the walk's own worst
 * case (3 attempts × start-reset + the teardown reset ≈ 4) with margin.
 * The cross-run aggregate is ceilinged by the shared 30/h walk-grant
 * budget in `passage-token.server.ts` (the named 429), which is the true
 * global cap; this limiter is the per-run runaway guard beneath it.
 */
const canaryResetLimiter = createRateLimiter(
  {
    name: 'Canary Reset (per run)',
    limit: 12,
    window: '1 h',
    prefix: 'canary_reset_run',
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

  // 3. Single-use scoped passage token (signature, TTL, scope, canary
  // binding, jti replay guard, and its own grant budget inside), verified
  // FIRST because the verified `run` claim keys the per-run reset budget
  // below. A grant-budget exhaustion is a NAMED 429 so the cert red says
  // "shared hourly budget", not auth drift (JOV-9826, red 45350750159);
  // every other denial stays the indistinguishable 401.
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

  // 4. Per-run reset budget, keyed by the verified token's run tag and
  // charged after the grant (JOV-9826, red 45366385483): the prior global
  // key was shared by every run and retry, so deploy storms exhausted any
  // fixed size. Per-run keying makes "one walk's retries can never be
  // denied by another run's consumption" structural; the cross-run
  // ceiling is the named passage 429 above.
  const rate = await canaryResetLimiter.limit(
    `canary-reset:${String(grant.claims.run ?? 'untagged')}`
  );
  if (!rate.success) {
    // The public response remains deliberately indistinguishable in shape.
    // Record only the provider-independent reason; metrics must not change
    // the denial.
    try {
      Sentry.metrics?.count('synthetic.canary_reset.denied', 1, {
        attributes: {
          reason:
            rate.unavailable === true
              ? 'limiter_unavailable'
              : 'per_run_budget_exhausted',
        },
      });
    } catch {
      // A telemetry failure cannot replace the original fail-closed 429.
    }
    return json(
      {
        error:
          'Canary reset budget exhausted (per-run hourly resets for this run tag); retry after the window clears',
      },
      429
    );
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
