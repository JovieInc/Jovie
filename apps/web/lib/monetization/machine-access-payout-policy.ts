/**
 * Machine-access revenue share policy constants (Pay Per Crawl P1 + x402 P2).
 *
 * Decision package: docs/product/machine-access-revenue-share-compliance.md (JOV-3831).
 * Exact artist share (D1) and final legal copy require Tim sign-off before production ToS.
 *
 * Do not invent parallel constants in UI or ledger code — import from here.
 */

/** Documented decision IDs from the compliance package. */
export type MachineAccessDecisionId = 'D1' | 'D2' | 'D3' | 'D4';

/**
 * Sign-off state for JOV-3831 decisions.
 * Flip to `approved` only after Tim records sign-off on the Linear issue.
 */
export type DecisionSignOffState = 'pending_tim' | 'approved' | 'revised';

export interface MachineAccessDecisionRecord {
  readonly id: MachineAccessDecisionId;
  readonly title: string;
  readonly state: DecisionSignOffState;
  readonly summary: string;
}

/** D1 — proposed artist-majority split (basis points of net attributed revenue). */
export const MACHINE_ACCESS_ARTIST_SHARE_BPS = 7_000; // 70%
export const MACHINE_ACCESS_PLATFORM_SHARE_BPS = 3_000; // 30%
export const MACHINE_ACCESS_SHARE_BPS_TOTAL = 10_000;

/** D2 — charging requires explicit opt-in; default OFF. */
export const MACHINE_ACCESS_OPT_IN_DEFAULT = false as const;

/** D3 — monthly cadence + $10 USD floor (cents). */
export const MACHINE_ACCESS_PAYOUT_CADENCE = 'monthly' as const;
export const MACHINE_ACCESS_PAYOUT_FLOOR_CENTS = 1_000;
export const MACHINE_ACCESS_PAYOUT_CURRENCY = 'usd' as const;

/** D4 — artists always receive fiat via Connect; platform handles any crypto rails. */
export const MACHINE_ACCESS_ARTIST_SETTLEMENT = 'fiat_stripe_connect' as const;
export const MACHINE_ACCESS_STABLECOIN_POLICY =
  'platform_redeems_to_fiat' as const;

/** U.S. 1099-NEC-style reporting threshold (cents) for annual creator payouts. */
export const MACHINE_ACCESS_US_1099_THRESHOLD_CENTS = 60_000;

/** Consent copy version — bump when §5 language changes post sign-off. */
export const MACHINE_ACCESS_CONSENT_COPY_VERSION = '2026-07-31-draft' as const;

export const MACHINE_ACCESS_DECISIONS: readonly MachineAccessDecisionRecord[] =
  [
    {
      id: 'D1',
      title: 'Revenue-share split',
      state: 'pending_tim',
      summary:
        'Artist 70% / platform 30% of net attributed machine-access revenue (artist-majority).',
    },
    {
      id: 'D2',
      title: 'Opt-in model',
      state: 'pending_tim',
      summary:
        'Explicit opt-in required; default OFF; charging may reduce free AI crawler access.',
    },
    {
      id: 'D3',
      title: 'Payout floor and cadence',
      state: 'pending_tim',
      summary: 'Monthly Stripe Connect Express payouts; $10 USD minimum.',
    },
    {
      id: 'D4',
      title: 'Stablecoin policy (P2/x402)',
      state: 'pending_tim',
      summary:
        'Platform redeems stablecoin to fiat; artists always paid fiat via Connect.',
    },
  ] as const;

/**
 * UI microcopy for the settings opt-in (draft until Tim + legal approve).
 * Keep Title Case for labels per DESIGN.md; body is sentence case.
 */
export const MACHINE_ACCESS_CONSENT_COPY = {
  version: MACHINE_ACCESS_CONSENT_COPY_VERSION,
  settingsTitle: 'Share AI Access Revenue',
  settingsDescription:
    'Optional opt-in (off by default). When on, Jovie may charge approved AI crawlers for automated access to your public profile and related pages, and share a majority of the net proceeds with you. Some AI services may reduce or stop accessing your content if they do not pay. You can turn this off anytime. Payouts are monthly in USD via Stripe Connect once your balance reaches $10.',
  optInConfirm:
    'By turning this on, you authorize Jovie to (1) apply machine-access charges to automated requests for your opted-in content, (2) attribute those charges to your profile, and (3) pay you your revenue share under Jovie’s Machine-Access Revenue Share terms. You understand that charging may reduce free AI crawler access to your content.',
  optOutNotice:
    'Turning this off stops new charging attribution for your pages. Accrued unpaid balance remains payable under the payout policy.',
} as const;

export interface MachineAccessShareSplitCents {
  readonly artistShareCents: number;
  readonly platformShareCents: number;
}

/**
 * Split net attributed revenue (integer cents) using the configured basis points.
 * Remainder cents from integer division go to the platform so artist share never
 * exceeds the configured rate.
 */
export function splitMachineAccessNetCents(
  netAttributedCents: number,
  artistShareBps: number = MACHINE_ACCESS_ARTIST_SHARE_BPS
): MachineAccessShareSplitCents {
  if (!Number.isFinite(netAttributedCents) || netAttributedCents < 0) {
    throw new RangeError(
      'netAttributedCents must be a non-negative finite number'
    );
  }
  if (
    !Number.isInteger(netAttributedCents) ||
    !Number.isInteger(artistShareBps) ||
    artistShareBps < 0 ||
    artistShareBps > MACHINE_ACCESS_SHARE_BPS_TOTAL
  ) {
    throw new RangeError(
      'artistShareBps must be an integer between 0 and 10000 inclusive; net must be integer cents'
    );
  }

  const artistShareCents = Math.floor(
    (netAttributedCents * artistShareBps) / MACHINE_ACCESS_SHARE_BPS_TOTAL
  );
  return {
    artistShareCents,
    platformShareCents: netAttributedCents - artistShareCents,
  };
}

/** Whether an accrued unpaid balance clears the payout floor. */
export function meetsMachineAccessPayoutFloor(
  accruedUnpaidCents: number,
  floorCents: number = MACHINE_ACCESS_PAYOUT_FLOOR_CENTS
): boolean {
  if (!Number.isFinite(accruedUnpaidCents) || accruedUnpaidCents < 0) {
    throw new RangeError(
      'accruedUnpaidCents must be a non-negative finite number'
    );
  }
  return accruedUnpaidCents >= floorCents;
}

/**
 * Whether calendar-year paid totals cross the U.S. information-return threshold.
 * Used for finance tooling — form type (NEC vs MISC) is counsel’s call.
 */
export function exceedsUs1099Threshold(
  calendarYearPaidCents: number,
  thresholdCents: number = MACHINE_ACCESS_US_1099_THRESHOLD_CENTS
): boolean {
  if (!Number.isFinite(calendarYearPaidCents) || calendarYearPaidCents < 0) {
    throw new RangeError(
      'calendarYearPaidCents must be a non-negative finite number'
    );
  }
  return calendarYearPaidCents >= thresholdCents;
}

/** True only when every JOV-3831 decision is marked approved in this module. */
export function isMachineAccessDecisionSetFullySignedOff(
  decisions: readonly MachineAccessDecisionRecord[] = MACHINE_ACCESS_DECISIONS
): boolean {
  return (
    decisions.length > 0 &&
    decisions.every(decision => decision.state === 'approved')
  );
}
