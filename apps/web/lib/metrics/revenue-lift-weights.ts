/**
 * Revenue-lift dollarization weights — single source of truth (gap 1 of
 * docs/REVENUE_LIFT_METRICS.md, JovieInc/Jovie#12141 / EPIC #12139).
 *
 * IRPAA's `revenue_lift` term dollarizes two proxy signals on top of real GMV:
 *
 *   revenue_lift = gmv_delta
 *                + (STREAMING_VALUE_WEIGHT × dsp_click_delta)
 *                + (FAN_CAPTURE_LTV_WEIGHT × new_fans_delta)
 *
 * Both weights below are LABELED PROXIES, not measured royalties. Every IRPAA
 * figure must be reported alongside `REVENUE_LIFT_WEIGHTS_VERSION` and
 * `lastValidatedAt` so consumers know which assumptions produced the number.
 *
 * Validation path (stated, per the doc): compare each proxy term against
 * realized `gmv_delta_cents` + completed tip revenue over a rolling 30-day
 * window and recalibrate. True royalty validation requires DSP royalty data
 * (Spotify for Artists / distributor statements), which has no API today —
 * until then these weights are assumptions with the citations below.
 */

/** Bump when either weight value changes so stored baselines stay auditable. */
export const REVENUE_LIFT_WEIGHTS_VERSION = 'v1';

/**
 * Dollar value (in cents) attributed to one non-bot `listen` smartlink click.
 *
 * Assumption chain:
 * - ~2.5 streams generated per intentful listen click-through (click → DSP
 *   session → repeat listens); internal assumption, unvalidated.
 * - ~$0.004 blended per-stream payout (public per-stream estimates across
 *   major DSPs commonly range $0.003–$0.005).
 * - 2.5 streams × $0.004 = $0.01 → 1 cent per DSP click.
 */
export const STREAMING_VALUE_WEIGHT_CENTS_PER_DSP_CLICK = 1;

/**
 * Dollar value (in cents) attributed to one newly captured fan (audience
 * member with email or phone first seen in the attribution window).
 *
 * Seeded from realized revenue-per-captured-fan (tips + merch GMV divided by
 * captured fans), not a guessed lifetime value. $2.50 is the launch seed;
 * recalibrate against `tips.amount_cents` (status = completed) and paid
 * `merch_orders.subtotal_cents` per captured fan once cohort volume exists.
 */
export const FAN_CAPTURE_LTV_WEIGHT_CENTS_PER_FAN = 250;

/**
 * ISO date the weights were last validated against realized GMV/tip revenue.
 * `null` until the first 30-day validation pass completes — consumers should
 * surface "unvalidated" when null.
 */
export const REVENUE_LIFT_WEIGHTS_LAST_VALIDATED_AT: string | null = null;

export interface RevenueLiftInputs {
  /** Real merch GMV in cents (paid Printful-backed order subtotals). */
  readonly gmvDeltaCents: number;
  /** Non-bot `listen` link clicks in the window. */
  readonly dspClickDelta: number;
  /** Audience members with email/phone first seen in the window. */
  readonly newFansDelta: number;
}

/**
 * Dollarize a revenue-lift row: real GMV plus weighted proxy terms.
 * Returns integer cents.
 */
export function dollarizeRevenueLiftCents(inputs: RevenueLiftInputs): number {
  return (
    inputs.gmvDeltaCents +
    STREAMING_VALUE_WEIGHT_CENTS_PER_DSP_CLICK * inputs.dspClickDelta +
    FAN_CAPTURE_LTV_WEIGHT_CENTS_PER_FAN * inputs.newFansDelta
  );
}

export interface RevenueLiftWeightsSnapshot {
  readonly version: string;
  readonly streamingValueWeightCentsPerDspClick: number;
  readonly fanCaptureLtvWeightCentsPerFan: number;
  readonly lastValidatedAt: string | null;
}

/** Snapshot for embedding next to any reported IRPAA / lift figure. */
export function getRevenueLiftWeightsSnapshot(): RevenueLiftWeightsSnapshot {
  return {
    version: REVENUE_LIFT_WEIGHTS_VERSION,
    streamingValueWeightCentsPerDspClick:
      STREAMING_VALUE_WEIGHT_CENTS_PER_DSP_CLICK,
    fanCaptureLtvWeightCentsPerFan: FAN_CAPTURE_LTV_WEIGHT_CENTS_PER_FAN,
    lastValidatedAt: REVENUE_LIFT_WEIGHTS_LAST_VALIDATED_AT,
  };
}
