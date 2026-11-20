import {
  isFreshProdGoldenPathPass,
  PROD_GOLDEN_PATH_SURFACE_IDS,
  PROD_GOLDEN_PATH_SURFACES,
  type ProdGoldenPathLedger,
  type ProdGoldenPathReceipt,
  type ProdGoldenPathSurfaceId,
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
/** The ten golden-path steps, in journey order. */
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
export type GoldenPathStepId = (typeof GOLDEN_PATH_STEPS)[number];
export type GoldenPathStepStatus =
  | 'passed'
  | 'failed'
  | 'blocked'
  | 'held'
  | 'expired'
  | 'missing';
export type GoldenPathStep = {
  readonly id: GoldenPathStepId;
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

export type ProdCertStepCheckSource = {
  readonly surface: ProdGoldenPathSurfaceId;
  readonly checkIds: readonly string[];
};

/**
 * Authoritative mapping from `GOLDEN_PATH_STEPS` to the check IDs emitted by
 * `scripts/lib/prod-cert.mjs` + `scripts/lib/prod-cert-probes.mjs`. Steps with
 * no production-cert check (`outreach`, `hosted-test-checkout`, `paid-value`)
 * remain unmapped so they report `missing` rather than false-passing.
 */
export const PROD_CERT_STEP_CHECKS: Readonly<
  Partial<Record<GoldenPathStepId, readonly ProdCertStepCheckSource[]>>
> = {
  'claim-landing': [
    { surface: 'claim', checkIds: ['claim-renders', 'claim-param-renders'] },
  ],
  start: [
    {
      surface: 'claim',
      checkIds: ['start-renders', 'start-preserves-handle'],
    },
  ],
  'qualify-chat': [{ surface: 'claim', checkIds: ['start-chat-first-reply'] }],
  'profile-reveal': [
    { surface: 'claim', checkIds: ['golden-path-preview-has-release'] },
  ],
  'claim-decision': [{ surface: 'claim', checkIds: ['claimed-profile-owned'] }],
  upgrade: [
    {
      surface: 'checkout',
      checkIds: [
        'offer-canonical-pricing',
        'checkout-entry-renders',
        'fresh-user-checkout-entry',
      ],
    },
  ],
  'first-use': [
    {
      surface: 'onboarding',
      checkIds: ['fresh-user-onboarding-first-value'],
    },
    { surface: 'chat', checkIds: ['first-reply'] },
  ],
};

const STEP_PRIORITY: Readonly<Record<GoldenPathStepStatus, number>> = {
  failed: 5,
  blocked: 4,
  missing: 3,
  expired: 2,
  held: 1,
  passed: 0,
};

function checkToStepStatus(
  checkStatus: string,
  receiptEndedAt: string,
  nowMs: number
): GoldenPathStepStatus {
  if (checkStatus === 'skipped') return 'held';
  if (checkStatus === 'blocked') return 'blocked';
  if (checkStatus === 'passed') {
    return isFreshProdGoldenPathPass(receiptEndedAt, nowMs)
      ? 'passed'
      : 'expired';
  }
  return 'failed';
}

function fixPrFromReceipt(
  receipt: ProdGoldenPathReceipt | undefined,
  status: GoldenPathStepStatus
): number | null {
  if (!receipt || status !== 'failed') return null;
  const pr =
    /\/pull\/(\d+)/u.exec(receipt.issueUrl ?? '')?.[1] ??
    /fix #(\d+)/u.exec(receipt.blocker ?? '')?.[1];
  return pr ? Number(pr) : null;
}

function projectStep(
  id: GoldenPathStepId,
  ledger: ProdGoldenPathLedger | null,
  nowMs: number
): GoldenPathStep {
  for (const record of Object.values(ledger?.surfaces ?? {})) {
    const receipt = record.latest;
    const direct = receipt.checks.find(c => c.id === id);
    if (!direct) continue;
    const status = checkToStepStatus(direct.status, receipt.endedAt, nowMs);
    return {
      id,
      status,
      surface: receipt.surface,
      fixPr: fixPrFromReceipt(receipt, status),
    };
  }

  const sources = PROD_CERT_STEP_CHECKS[id];
  if (!sources || !ledger) {
    return { id, status: 'missing', surface: null, fixPr: null };
  }

  let sawAnyMappedCheck = false;
  let worst: {
    status: GoldenPathStepStatus;
    receipt: ProdGoldenPathReceipt | undefined;
  } | null = null;

  for (const source of sources) {
    const receipt = ledger.surfaces[source.surface]?.latest;
    for (const checkId of source.checkIds) {
      const check = receipt?.checks.find(c => c.id === checkId);
      let status: GoldenPathStepStatus = 'missing';
      if (check && receipt) {
        sawAnyMappedCheck = true;
        status = checkToStepStatus(check.status, receipt.endedAt, nowMs);
      } else if (receipt?.status === 'blocked') {
        sawAnyMappedCheck = true;
        status = 'blocked';
      }
      if (!worst || STEP_PRIORITY[status] > STEP_PRIORITY[worst.status]) {
        worst = { status, receipt };
      }
    }
  }

  if (!sawAnyMappedCheck || !worst) {
    return { id, status: 'missing', surface: null, fixPr: null };
  }
  return {
    id,
    status: worst.status,
    surface: worst.receipt?.surface ?? null,
    fixPr: fixPrFromReceipt(worst.receipt, worst.status),
  };
}

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
          ? isFreshProdGoldenPathPass(receipt.endedAt, nowMs)
            ? 'certified'
            : 'expired'
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
  const steps = GOLDEN_PATH_STEPS.map(id => projectStep(id, ledger, nowMs));
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
