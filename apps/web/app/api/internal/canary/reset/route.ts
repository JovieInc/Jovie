import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cron/auth';
import { env } from '@/lib/env-server';
import { createRateLimiter } from '@/lib/rate-limit';
import { executeCanaryReset } from '@/lib/synthetic/canary-reset.server';
import { PASSAGE_TOKEN_SCOPE_CANARY_RESET } from '@/lib/synthetic/passage-token';
import { resolveSyntheticPassageToken } from '@/lib/synthetic/passage-token.server';

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
 *      with replay protection → 401;
 *   4. a 12/hour Redis-backed fixed-window limit, fail closed without
 *      Redis → 429.
 *
 * The endpoint refuses every account whose email is not the exact canary
 * address; the reset itself deletes only rows owned by that user id and
 * logs every reset tagged internal. See `canary-reset-plan.ts` for the
 * exact reset semantics.
 */

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Route-local limiter (the sms-intents route pattern): 12/hour across all
 * runs, Redis-backed. Fail closed without Redis: requireRedis at both the
 * config and the limiter level means an unavailable store denies, never
 * degrades to memory, because this endpoint mutates accounts.
 *
 * Sizing (JOV-9826, red 45350243078): Post-Deploy Probes fires on every
 * deploy/promotion — several runs per hour — and each walk consumes two
 * resets (pre-claim open + post-activation close). The prior 6/hour cap
 * made the budget the BINDING failure for otherwise-healthy walks (every
 * walk past the third run in an hour hit an opaque 429 before checkout).
 * 12 matches the synthetic-passage-token allowance (rate-limit/config.ts:
 * `syntheticPassageToken` 12/h) — and because every reset requires a
 * single-use passage token, that allowance is the true security ceiling;
 * the route cap now defers to it instead of contradicting it. Mutation
 * scope is unchanged: bearer + single-use passage token + canary-email
 * fence + fail-closed Redis requirement.
 */
const canaryResetLimiter = createRateLimiter(
  {
    name: 'Canary Reset',
    limit: 12,
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

  // 3. Single-use scoped passage token (signature, TTL, scope, canary
  // binding, jti replay guard, and its own limiter inside).
  const grant = await resolveSyntheticPassageToken(
    request.headers,
    PASSAGE_TOKEN_SCOPE_CANARY_RESET,
    {
      consume: true,
      requestId: request.headers.get('x-request-id') ?? undefined,
    }
  );
  if (!grant) {
    return json({ error: 'Valid canary passage token required' }, 401);
  }

  // 4. Dedicated 12/hour budget for account resets, aligned with (and
  // never exceeding) the passage-token allowance that each reset consumes.
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
