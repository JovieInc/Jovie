import type { KnownBadFlowFix } from './registry';

export interface FixCertifier {
  /** True when the fix's commit is deployed to production right now. */
  isLiveOnProduction(fix: KnownBadFlowFix): Promise<boolean>;
  /** Re-runs the step's production check; true only on a pass. */
  recheck(checkId: string): Promise<boolean>;
}

export interface FixCertification {
  readonly fixId: string;
  readonly live: boolean;
  readonly reason:
    | 'certified'
    | 'no_deploy_recorded'
    | 'not_on_production'
    | 'check_failed';
}

/**
 * Never email about an unfixed flow: a fix counts only when it records a
 * deploy, production serves it, and its check passes at send time.
 */
export async function certifyFix(
  fix: KnownBadFlowFix,
  certifier: FixCertifier
): Promise<FixCertification> {
  const out = (live: boolean, reason: FixCertification['reason']) => ({
    fixId: fix.id,
    live,
    reason,
  });
  if (!fix.deployedAt) return out(false, 'no_deploy_recorded');
  if (!(await certifier.isLiveOnProduction(fix))) {
    return out(false, 'not_on_production');
  }
  if (!(await certifier.recheck(fix.checkId)))
    return out(false, 'check_failed');
  return out(true, 'certified');
}
