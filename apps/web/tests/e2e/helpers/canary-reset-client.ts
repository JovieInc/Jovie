import { Buffer } from 'node:buffer';
import type { APIRequestContext } from '@playwright/test';
import { mintPassageToken } from '@/lib/synthetic/passage-token';
import {
  PRODCERT_CLAIM_CANARY_EMAIL,
  PRODCERT_CLAIM_CANARY_HANDLE,
} from '@/lib/synthetic/prodcert-identities';

/**
 * Client for the canary-only reset endpoint (JOV-9826).
 *
 * The production claim + checkout certification calls this before and after
 * the walk so the fixed claim-walk canary always starts and ends in its
 * pre-claim state and no public profile is left behind. The endpoint
 * requires BOTH the CRON_SECRET bearer and a single-use `canary_reset`
 * passage token (minted from the derived key, exactly like the /start
 * passage in the auth smoke), and is limited to 6 resets per hour.
 */

export interface CanaryResetContext {
  readonly request: APIRequestContext;
  readonly origin: string;
  readonly runTag: string;
}

/** Verdict of the preflight probe against the target surface's Redis. */
export type CanaryResetSurfacePreflight =
  | { readonly ready: true; readonly detail: string }
  | { readonly ready: false; readonly detail: string };

/**
 * Classify GET /api/health/redis on the target surface (pure; unit-tested).
 *
 * The reset endpoint's passage-token consume path is Redis-only and fails
 * closed (passage-token.server.ts: limiter requireRedis + jti replay guard),
 * so a surface without Redis denies EVERY reset with an opaque 401 —
 * postdeploy run 45311864925: staging.jov.ie (Vercel preview) selects the
 * in-memory store by policy (redis-store.ts), and all three walk attempts
 * died on `canary reset HTTP 401` in under four seconds. The health route is
 * bearer-gated (CRON_SECRET) and probes Redis operability without consuming
 * anything, so the walk asks it first and names the gap instead.
 */
export function classifyCanaryResetSurfaceProbe(
  status: number,
  body: string
): CanaryResetSurfacePreflight {
  if (status === 200) {
    return { ready: true, detail: 'surface Redis is operable' };
  }
  if (status === 404 || status === 405) {
    // Landed build predates /api/health/redis; the reset endpoint itself
    // remains the authority, as before this preflight existed.
    return {
      ready: true,
      detail: `surface predates /api/health/redis (HTTP ${status}); deferring to the reset endpoint`,
    };
  }
  if (status === 503 && /not_configured|unavailable/iu.test(body)) {
    return {
      ready: false,
      detail:
        'surface has no Redis (Vercel preview selects the in-memory store by policy), so it cannot consume canary passage tokens; wire a non-production Upstash instance to the project env (JOV-9826)',
    };
  }
  if (status === 401 || status === 403) {
    return {
      ready: false,
      detail:
        'surface rejected the CRON_SECRET bearer on /api/health/redis — the CRON_SECRET in this run (Doppler jovie-web/prd) does not match the target surface env, so the reset bearer check will fail too',
    };
  }
  return {
    ready: false,
    detail: `surface Redis probe returned HTTP ${status}: ${body.slice(0, 200)}`,
  };
}

/**
 * Fail fast, with a named reason, when the target surface cannot consume
 * canary passage tokens. Bearer-gated probe only: no token is minted or
 * consumed, no state is touched. Legacy builds without the health route
 * pass through so the reset endpoint stays the judge (never weaker).
 */
export async function assertCanaryResetSurfaceReady({
  request,
  origin,
}: {
  readonly request: APIRequestContext;
  readonly origin: string;
}): Promise<CanaryResetSurfacePreflight> {
  const cronSecret = process.env.CRON_SECRET ?? '';
  if (!cronSecret) {
    throw new Error('CRON_SECRET is not provided to this run');
  }
  const bypassSecret = process.env.PLAYWRIGHT_VERCEL_BYPASS_SECRET;
  const response = await request.get(`${origin}/api/health/redis`, {
    headers: {
      authorization: `Bearer ${cronSecret}`,
      ...(bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {}),
    },
    timeout: 15_000,
  });
  const status = response.status();
  const body = (await response.text()).slice(0, 500);
  const verdict = classifyCanaryResetSurfaceProbe(status, body);
  if (!verdict.ready) {
    throw new Error(
      `canary reset preflight: ${origin} cannot run the JOV-9826 walk — ${verdict.detail}`
    );
  }
  return verdict;
}

export interface CanaryResetEnv {
  readonly CRON_SECRET?: string;
  readonly SYNTHETIC_PASSAGE_KEY?: string;
}

/**
 * True when this run holds both secrets the reset endpoint requires.
 * Callers record a blocked step (never a silent skip) when false.
 */
export function canaryResetConfigured(
  environment: CanaryResetEnv = process.env as CanaryResetEnv
): boolean {
  return !!(environment.CRON_SECRET && environment.SYNTHETIC_PASSAGE_KEY);
}

/**
 * The endpoint's 409 when the fixed claim-walk canary has no account in this
 * environment yet. The walk answers it by signing the canary up through the
 * real email-code flow (`provisionClaimCanary` in the spec), so no person
 * ever has to create the account by hand.
 */
export class ClaimCanaryNotProvisionedError extends Error {
  constructor(detail: string) {
    super(`canary reset HTTP 409: ${detail}`);
    this.name = 'ClaimCanaryNotProvisionedError';
  }
}

/**
 * The reset endpoint's dedicated 6/hour budget (shared across all runs in
 * the Redis window) is exhausted. Retrying the walk cannot help until the
 * window clears — every retry that reaches reset would burn the budget
 * again (post-fix red 45336880733 retry #2). Named so the cert red is a
 * budget condition, not an opaque 429.
 */
export class CanaryResetRateLimitedError extends Error {
  constructor(detail: string) {
    super(`canary reset HTTP 429: ${detail}`);
    this.name = 'CanaryResetRateLimitedError';
  }
}

/** POST /api/internal/canary/reset and assert it completed. */
export async function resetClaimCanary({
  request,
  origin,
  runTag,
}: CanaryResetContext): Promise<void> {
  const cronSecret = process.env.CRON_SECRET ?? '';
  const passageKey = process.env.SYNTHETIC_PASSAGE_KEY ?? '';
  if (!cronSecret || !passageKey) {
    throw new Error(
      'CRON_SECRET/SYNTHETIC_PASSAGE_KEY are not provided to this run'
    );
  }
  const token = mintPassageToken(Buffer.from(passageKey, 'base64url'), {
    sub: PRODCERT_CLAIM_CANARY_EMAIL,
    scp: 'canary_reset',
    run: runTag.slice(0, 64),
    ttlSeconds: 300,
  });
  const bypassSecret = process.env.PLAYWRIGHT_VERCEL_BYPASS_SECRET;
  const response = await request.post(`${origin}/api/internal/canary/reset`, {
    headers: {
      authorization: `Bearer ${cronSecret}`,
      'x-jovie-synthetic-passage': token,
      // Exact `*.vercel.app` postdeploy targets are behind Vercel Authentication.
      // Without the bypass header, Playwright follows the SSO redirect to an
      // HTML 200 and a status-only check would soft-pass a no-op reset.
      ...(bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {}),
    },
  });
  const contentType = (response.headers()['content-type'] ?? '').toLowerCase();
  const bodyText = await response.text();
  if (response.status() === 409 && /not provisioned/iu.test(bodyText)) {
    throw new ClaimCanaryNotProvisionedError(bodyText.slice(0, 300));
  }
  if (response.status() === 429) {
    throw new CanaryResetRateLimitedError(bodyText.slice(0, 300));
  }
  if (response.status() !== 200) {
    throw new Error(
      `canary reset HTTP ${response.status()}: ${bodyText.slice(0, 300)}`
    );
  }
  if (!contentType.includes('application/json')) {
    throw new Error(
      `canary reset returned non-JSON (${contentType || 'missing content-type'}): ${bodyText.slice(0, 200)}`
    );
  }
}

export { PRODCERT_CLAIM_CANARY_EMAIL, PRODCERT_CLAIM_CANARY_HANDLE };
