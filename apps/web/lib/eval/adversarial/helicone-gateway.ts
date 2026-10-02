/**
 * Helicone-routed Vercel AI Gateway client for real-model eval lanes.
 *
 * Live provider calls are metered spend. Enabling the lane therefore requires
 * an explicit cost eligibility declaration (account, provider, and cap), not
 * just the opt-in flag and credentials — without it the lane stays disabled
 * even if the flag is set and keys exist (JOV-6234).
 */

import { createGateway } from '@ai-sdk/gateway';

import { EvalBudgetTracker, parseBudgetCapUsd } from './budget';

const HELICONE_VERCEL_GATEWAY_BASE_URL = 'https://vercel.helicone.ai/v1/ai';

/**
 * Required shape of the `REAL_EVAL_ELIGIBILITY` JSON token:
 * `{ "account": string, "provider": string, "capUsd": number }`.
 */
export interface RealEvalEligibility {
  readonly account: string;
  readonly provider: string;
  readonly capUsd: number;
}

/** Parse and validate the explicit eligibility token; null = not declared. */
export function parseRealEvalEligibility(
  raw: string | undefined
): RealEvalEligibility | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const { account, provider, capUsd } = parsed as Record<string, unknown>;
  if (typeof account !== 'string' || account.length === 0) return null;
  if (typeof provider !== 'string' || provider.length === 0) return null;
  if (typeof capUsd !== 'number' || !Number.isFinite(capUsd) || capUsd <= 0) {
    return null;
  }
  return { account, provider, capUsd };
}

/**
 * Resolved eligibility for the current run: null when the lane is disabled.
 * When eligible, `capUsd` is the bounded cap actually applied to the run
 * (an out-of-range declared cap falls back to the conservative default).
 */
export interface RealEvalRunEligibility {
  readonly account: string;
  readonly provider: string;
  readonly capUsd: number;
  readonly declaredCapUsd: number;
}

export function resolveRealEvalEligibility(
  env: Readonly<Record<string, string | undefined>> = process.env
): RealEvalRunEligibility | null {
  const declared = parseRealEvalEligibility(env.REAL_EVAL_ELIGIBILITY);
  if (!declared) return null;
  if (env.JOVIE_RUN_REAL_MODEL_EVALS !== '1') return null;
  if (!env.AI_GATEWAY_API_KEY || !env.HELICONE_API_KEY) return null;
  const capUsd = parseBudgetCapUsd(String(declared.capUsd));
  return {
    account: declared.account,
    provider: declared.provider,
    capUsd,
    declaredCapUsd: declared.capUsd,
  };
}

export function isRealModelEvalEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  return resolveRealEvalEligibility(env) !== null;
}

/** The enforced budget cannot exceed the authorization or a stricter override. */
export function createRealEvalBudgetTracker(
  env: Readonly<Record<string, string | undefined>> = process.env
): EvalBudgetTracker {
  const eligibility = resolveRealEvalEligibility(env);
  if (!eligibility) throw new Error('Real eval cost eligibility is required');
  return new EvalBudgetTracker(
    Math.min(
      eligibility.capUsd,
      parseBudgetCapUsd(env.BUDGET_CAP_USD, eligibility.capUsd)
    )
  );
}

/** Machine-readable provenance line for run logs (account/provider/cap). */
export function formatRealEvalProvenance(
  eligibility: RealEvalRunEligibility
): string {
  return [
    'REAL_EVAL_PROVENANCE',
    `account=${eligibility.account}`,
    `provider=${eligibility.provider}`,
    `capUsd=${eligibility.capUsd.toFixed(2)}`,
    `declaredCapUsd=${eligibility.declaredCapUsd}`,
  ].join(' ');
}

export function createHeliconeGateway() {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  const heliconeKey = process.env.HELICONE_API_KEY;

  if (!apiKey) {
    throw new Error('AI_GATEWAY_API_KEY is required for real-model evals');
  }
  if (!heliconeKey) {
    throw new Error('HELICONE_API_KEY is required for real-model evals');
  }

  return createGateway({
    apiKey,
    baseURL: HELICONE_VERCEL_GATEWAY_BASE_URL,
    headers: {
      'Helicone-Auth': `Bearer ${heliconeKey}`,
      'Helicone-Property-Eval-Lane': 'golden-real',
      'Helicone-Property-Branch': process.env.GITHUB_HEAD_REF ?? 'local',
    },
  });
}
