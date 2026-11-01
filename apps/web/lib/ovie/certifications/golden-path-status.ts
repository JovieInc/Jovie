import {
  PROD_GOLDEN_PATH_FRESHNESS_MS,
  PROD_GOLDEN_PATH_SURFACE_IDS,
  PROD_GOLDEN_PATH_SURFACES,
  type ProdGoldenPathLedger,
} from './prod-golden-path-ledger';

/**
 * Compact production golden-path status for Summer's founder line (2026-11-01: her hourly report
 * said "reader missing" because no read existed). Projects the authoritative production receipts
 * (scripts/prod-cert.mjs -> /api/internal/ovie/golden-path-evidence -> this ledger) per surface:
 * certified (passed inside 24h), expired, failed, blocked or missing. No receipt is never "passed".
 */
export type GoldenPathSurfaceStatus =
  | 'certified'
  | 'expired'
  | 'failed'
  | 'blocked'
  | 'missing';
export type GoldenPathStatusSurface = {
  readonly id: string;
  readonly title: string;
  readonly status: GoldenPathSurfaceStatus;
  readonly sha: string | null;
  readonly endedAt: string | null;
  readonly failedChecks: readonly string[];
  readonly blocker: string | null;
  readonly issueUrl: string | null;
};
/** The ten golden-path steps, in journey order, as prod-cert records them in each receipt's checks[]. */
export const GOLDEN_PATH_STEPS = [
  'outreach',
  'claim-landing',
  'start',
  'qualify-chat',
  'profile-reveal',
  'claim-decision',
  'upgrade',
  'hosted-test-checkout',
  'paid-value',
  'first-use',
] as const;
export type GoldenPathStepStatus =
  | 'passed'
  | 'failed'
  | 'held'
  | 'expired'
  | 'missing';
export type GoldenPathStep = {
  readonly id: (typeof GOLDEN_PATH_STEPS)[number];
  readonly status: GoldenPathStepStatus;
  readonly surface: string | null;
  /** The fix PR number when the failing surface links one (issueUrl or "fix #N" in the blocker). */
  readonly fixPr: number | null;
};
export type GoldenPathStatus = {
  readonly schema: 'jovie.summer-golden-path-status/v1';
  /** Steps from checks[] across the latest receipts: what "Golden path N/10" counts. */
  readonly steps: readonly GoldenPathStep[];
  readonly stepsPassed: number;
  readonly observedAt: string;
  readonly ledger: 'available' | 'missing';
  readonly ledgerUpdatedAt: string | null;
  readonly total: number;
  readonly certified: number;
  readonly surfaces: readonly GoldenPathStatusSurface[];
};

export function goldenPathStatus(
  ledger: ProdGoldenPathLedger | null,
  now: Date
): GoldenPathStatus {
  const nowMs = now.getTime();
  const surfaces = PROD_GOLDEN_PATH_SURFACE_IDS.map(
    (id): GoldenPathStatusSurface => {
      const receipt = ledger?.surfaces[id]?.latest;
      const title = PROD_GOLDEN_PATH_SURFACES[id].title;
      if (!receipt)
        return {
          id,
          title,
          status: 'missing',
          sha: null,
          endedAt: null,
          failedChecks: [],
          blocker: null,
          issueUrl: null,
        };
      const status: GoldenPathSurfaceStatus =
        receipt.status === 'passed'
          ? nowMs - Date.parse(receipt.endedAt) > PROD_GOLDEN_PATH_FRESHNESS_MS
            ? 'expired'
            : 'certified'
          : receipt.status;
      return {
        id,
        title,
        status,
        sha: receipt.sha.slice(0, 7),
        endedAt: receipt.endedAt,
        failedChecks: receipt.checks
          .filter(c => c.status === 'failed')
          .map(c => c.id)
          .slice(0, 10),
        blocker: receipt.blocker ? receipt.blocker.slice(0, 200) : null,
        issueUrl: receipt.issueUrl,
      };
    }
  );
  const steps = GOLDEN_PATH_STEPS.map((id): GoldenPathStep => {
    for (const record of Object.values(ledger?.surfaces ?? {})) {
      const receipt = record.latest;
      const check = receipt.checks.find(c => c.id === id);
      if (!check) continue;
      const stale =
        nowMs - Date.parse(receipt.endedAt) > PROD_GOLDEN_PATH_FRESHNESS_MS;
      const status: GoldenPathStepStatus =
        check.status === 'skipped'
          ? 'held'
          : check.status === 'passed'
            ? stale
              ? 'expired'
              : 'passed'
            : 'failed';
      const pr =
        /\/pull\/(\d+)/u.exec(receipt.issueUrl ?? '')?.[1] ??
        /fix #(\d+)/u.exec(receipt.blocker ?? '')?.[1];
      return {
        id,
        status,
        surface: receipt.surface,
        fixPr: status === 'failed' && pr ? Number(pr) : null,
      };
    }
    return { id, status: 'missing', surface: null, fixPr: null };
  });
  return {
    schema: 'jovie.summer-golden-path-status/v1',
    steps,
    stepsPassed: steps.filter(s => s.status === 'passed').length,
    observedAt: now.toISOString(),
    ledger: ledger ? 'available' : 'missing',
    ledgerUpdatedAt: ledger?.updatedAt ?? null,
    total: surfaces.length,
    certified: surfaces.filter(s => s.status === 'certified').length,
    surfaces,
  };
}
