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
export type GoldenPathStatus = {
  readonly schema: 'jovie.summer-golden-path-status/v1';
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
  return {
    schema: 'jovie.summer-golden-path-status/v1',
    observedAt: now.toISOString(),
    ledger: ledger ? 'available' : 'missing',
    ledgerUpdatedAt: ledger?.updatedAt ?? null,
    total: surfaces.length,
    certified: surfaces.filter(s => s.status === 'certified').length,
    surfaces,
  };
}
