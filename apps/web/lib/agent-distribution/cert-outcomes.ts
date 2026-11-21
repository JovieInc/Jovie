/**
 * JOV-9760 creator outcomes for the agent-path cert harness.
 *
 * Transport success (claim_url HTTP 200) is not a persisted claim. These
 * checks require the production claim-walk canary secrets plus DATABASE_URL
 * for OTP readback — the same gate as the Playwright canary checkout walk.
 *
 * Until those secrets are present this module returns SKIP with an explicit
 * missing-env list so readiness stays fail-closed (REQUIRED_OUTCOME_CHECKS
 * demand PASS). When secrets are present, callers may inject a walker.
 */
import { REQUIRED_OUTCOME_CHECKS } from './cert-helpers';

export interface OutcomeCheck {
  check: string;
  status: 'PASS' | 'FAIL' | 'RATE_LIMITED' | 'SKIP';
  ms: number | null;
  detail?: unknown;
}

export const CLAIM_OUTCOME_ENV = [
  'CRON_SECRET',
  'SYNTHETIC_PASSAGE_KEY',
  'DATABASE_URL',
] as const;

export type ClaimOutcomeEnvName = (typeof CLAIM_OUTCOME_ENV)[number];

export type ClaimOutcomeEnv = Readonly<Record<string, string | undefined>>;

export interface ClaimOutcomeContext {
  readonly origin: string;
  readonly run: string;
  readonly draftId: string | undefined;
  readonly claimUrl: string | undefined;
  readonly env?: ClaimOutcomeEnv;
  /**
   * Optional walker for environments that hold the claim-walk secrets.
   * Returns true when a claimed profile/smart-link attribution was observed
   * and run-owned fixtures were cleaned (canary reset / draft purge).
   */
  readonly walk?: (ctx: {
    readonly origin: string;
    readonly run: string;
    readonly draftId: string;
    readonly claimUrl: string;
  }) => Promise<{
    readonly claimPersisted: boolean;
    readonly fixturesCleaned: boolean;
    readonly detail?: unknown;
  }>;
}

export function missingClaimOutcomeEnv(
  env: ClaimOutcomeEnv = process.env
): ClaimOutcomeEnvName[] {
  return CLAIM_OUTCOME_ENV.filter(name => !env[name]?.trim());
}

/** Record SKIP/PASS/FAIL for both REQUIRED_OUTCOME_CHECKS. */
export async function exerciseClaimOutcomes(
  ctx: ClaimOutcomeContext
): Promise<OutcomeCheck[]> {
  const env = ctx.env ?? process.env;
  const missing = missingClaimOutcomeEnv(env);
  if (missing.length > 0) {
    const detail = {
      gate: 'claim-walk-secrets',
      missing,
      note: 'JOV-9760 requires CRON_SECRET + SYNTHETIC_PASSAGE_KEY (canary reset) and DATABASE_URL (OTP readback). Not a transport pass.',
    };
    return REQUIRED_OUTCOME_CHECKS.map(check => ({
      check,
      status: 'SKIP' as const,
      ms: null,
      detail,
    }));
  }

  if (!ctx.draftId || !ctx.claimUrl) {
    return REQUIRED_OUTCOME_CHECKS.map(check => ({
      check,
      status: 'FAIL' as const,
      ms: null,
      detail: 'no draft_id/claim_url to claim or clean',
    }));
  }

  if (!ctx.walk) {
    return REQUIRED_OUTCOME_CHECKS.map(check => ({
      check,
      status: 'SKIP' as const,
      ms: null,
      detail: {
        gate: 'claim-walker-unwired',
        note: 'Secrets present but no claim walker injected; wire the canary claim walk before treating agentPathCert as ready.',
      },
    }));
  }

  const started = performance.now();
  try {
    const result = await ctx.walk({
      origin: ctx.origin,
      run: ctx.run,
      draftId: ctx.draftId,
      claimUrl: ctx.claimUrl,
    });
    const ms = Math.round(performance.now() - started);
    return [
      {
        check: 'claim outcome persisted',
        status: result.claimPersisted ? 'PASS' : 'FAIL',
        ms,
        detail: result.detail,
      },
      {
        check: 'run-owned fixtures cleaned up',
        status: result.fixturesCleaned ? 'PASS' : 'FAIL',
        ms,
        detail: result.detail,
      },
    ];
  } catch (error) {
    return REQUIRED_OUTCOME_CHECKS.map(check => ({
      check,
      status: 'FAIL' as const,
      ms: Math.round(performance.now() - started),
      detail: String(error),
    }));
  }
}
