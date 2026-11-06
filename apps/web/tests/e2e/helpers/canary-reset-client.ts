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

export interface CanaryResetEnv {
  readonly CRON_SECRET?: string;
  readonly SYNTHETIC_PASSAGE_KEY?: string;
}

/**
 * True when this run holds both secrets the reset endpoint requires.
 * Callers record a blocked step (never a silent skip) when false.
 */
export function canaryResetConfigured(
  environment: CanaryResetEnv = process.env
): boolean {
  return !!(environment.CRON_SECRET && environment.SYNTHETIC_PASSAGE_KEY);
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
  const response = await request.post(`${origin}/api/internal/canary/reset`, {
    headers: {
      authorization: `Bearer ${cronSecret}`,
      'x-jovie-synthetic-passage': token,
    },
  });
  if (response.status() !== 200) {
    throw new Error(
      `canary reset HTTP ${response.status()}: ${(await response.text()).slice(0, 300)}`
    );
  }
}

export { PRODCERT_CLAIM_CANARY_EMAIL, PRODCERT_CLAIM_CANARY_HANDLE };
