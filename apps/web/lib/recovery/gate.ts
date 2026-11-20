import type { ProdGoldenPathLedger } from '@/lib/ovie/certifications/prod-golden-path-ledger';
import { certificationVerdict } from '../../../../scripts/lib/prod-cert.mjs';
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

/**
 * Whole golden path verdict. Reads the production golden-path ledger and
 * reuses `certificationVerdict` (scripts/lib/prod-cert.mjs), the one function
 * that decides "all 8 surfaces passed on the served SHA within 24h". The logic
 * is not duplicated here. A missing ledger or unknown SHA is a no.
 */
export function isGoldenPathGreen(
  ledger: ProdGoldenPathLedger | null,
  sha: string | null,
  now: Date = new Date()
): boolean {
  if (!ledger || !sha) return false;
  const receipts = Object.values(ledger.surfaces).map(record => record.latest);
  return certificationVerdict(receipts, {
    servedSha: sha,
    nowMs: now.getTime(),
  }).certified;
}
