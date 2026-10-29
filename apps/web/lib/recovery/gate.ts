import type { KnownBadFlowFix } from './registry';

export interface FixCertifier {
  /** True when production is serving a build that contains the fix right now. */
  isLiveOnProduction(fix: KnownBadFlowFix): Promise<boolean>;
  /** First moment production was observed serving the fix (recorded once). */
  deployedAt(fix: KnownBadFlowFix): Promise<string | null>;
  /** Re-runs the step's production check; true only on a pass. */
  recheck(checkId: string): Promise<boolean>;
  /** Whole launch golden path green, certified and fresh on production. */
  goldenPathGreen(): Promise<boolean>;
}

export interface FixCertification {
  readonly fixId: string;
  readonly live: boolean;
  readonly deployedAt: string | null;
  readonly reason:
    | 'certified'
    | 'no_deploy_recorded'
    | 'not_on_production'
    | 'check_failed'
    | 'golden_path_red';
}

/**
 * Never email about an unfixed flow: a fix counts only when it records a
 * deploy, production serves it, and its check passes at send time.
 */
export async function certifyFix(
  fix: KnownBadFlowFix,
  certifier: FixCertifier
): Promise<FixCertification> {
  const out = (
    live: boolean,
    reason: FixCertification['reason'],
    deployedAt: string | null = null
  ): FixCertification => ({ fixId: fix.id, live, deployedAt, reason });
  if (!fix.shippedInCode) return out(false, 'no_deploy_recorded');
  if (!(await certifier.isLiveOnProduction(fix))) {
    return out(false, 'not_on_production');
  }
  const deployedAt = await certifier.deployedAt(fix);
  if (!deployedAt) return out(false, 'no_deploy_recorded');
  if (!(await certifier.recheck(fix.checkId))) {
    return out(false, 'check_failed', deployedAt);
  }
  if (!(await certifier.goldenPathGreen())) {
    return out(false, 'golden_path_red', deployedAt);
  }
  return out(true, 'certified', deployedAt);
}

/** Launch-gate surfaces a recovered user walks through, in order. */
export const RECOVERY_GOLDEN_PATH_SURFACES = [
  'landing',
  'signup-signin',
  'claim',
  'onboarding',
  'chat',
  'public-profile',
] as const;

export const GOLDEN_PATH_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface GoldenPathReceiptView {
  readonly status: string;
  readonly sha: string;
  readonly endedAt: string;
}

/**
 * Every launch-gate surface must have a passed receipt on the current
 * production commit, finished within 24 hours. Missing, red, blocked, stale or
 * other-commit evidence is a no.
 */
export function isGoldenPathGreen(
  latest: Readonly<Record<string, GoldenPathReceiptView | undefined>>,
  sha: string,
  now: Date
): boolean {
  return RECOVERY_GOLDEN_PATH_SURFACES.every(surface => {
    const receipt = latest[surface];
    if (!receipt) return false;
    const age = now.getTime() - Date.parse(receipt.endedAt);
    return (
      receipt.status === 'passed' &&
      receipt.sha === sha &&
      Number.isFinite(age) &&
      age >= 0 &&
      age < GOLDEN_PATH_MAX_AGE_MS
    );
  });
}
