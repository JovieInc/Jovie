/**
 * x402 payment-rail unit economics for the Monetization-Gateway P2 spike (GitHub #12750).
 *
 * Answers the unit-economics gate question: at what per-call price do the x402
 * settlement rails stop eating the revenue? Values are the Base + Coinbase/CDP
 * facilitator path; sources are cited in
 * `docs/spikes/x402-payment-gated-artist-resources.md`. Update the constants there
 * when the fee schedule changes.
 *
 * All amounts are USD. Functions return numbers (never `$`-strings) so callers do
 * the formatting via the canonical currency helpers.
 */

/** Base L2 gas per USDC transfer; x402 quotes "<one ten-thousandth of a dollar". */
export const BASE_GAS_PER_CALL_USD = 0.0001;

/** Coinbase/CDP facilitator settlement fee on USDC/Base: zero. */
export const CDP_SETTLEMENT_FEE_USD = 0;

/** CDP facilitator API metering: free up to this many settlements per month. */
export const CDP_FREE_TIER_TX_PER_MONTH = 1000;

/** CDP facilitator API metering charge per settlement above the free tier. */
export const CDP_METERED_FEE_PER_CALL_USD = 0.001;

/**
 * USDC -> fiat off-ramp rate applied in batch at redemption, not per call.
 * Range: ~0% (free ACH) to ~1.5% (instant debit rail). Plan on the worst case.
 */
export const OFFRAMP_RATE_WORST_CASE = 0.015;

/**
 * Fraction of the price the payment rails may consume before the resource is
 * "not a tier, a subsidy" (PRICING-PHILOSOPHY Principle 7 leaves >=50% for the
 * compute COGS + margin). Rails alone must stay under this.
 */
export const MAX_RAIL_OVERHEAD = 0.5;

export const X402_MIN_GROSS_MARGIN_RATE = 1 - MAX_RAIL_OVERHEAD;
export const X402_RECOMMENDED_PRICE_FLOOR_USD = 0.01;

type LegacyRailCostOptions = {
  readonly facilitatorSettlementFeeUsd?: number;
  readonly gasPerCallUsd?: number;
  readonly cdpMeteringPerTxUsd?: number;
  readonly aboveCdpFreeTier?: boolean;
  readonly offRampFeeRate?: number;
};

type LegacyUnitEconomicsResult = {
  readonly priceUsd: number;
  readonly railCostUsd: number;
  readonly offRampCostUsd: number;
  readonly totalRailCostUsd: number;
  readonly grossMarginRate: number;
  readonly clearsMarginGate: boolean;
};

/**
 * Fixed per-call rail cost (independent of price): gas + settlement fee, plus CDP
 * metering once monthly volume clears the free tier. Off-ramp is percentage-based
 * and excluded here (see {@link railOverheadRatio}).
 */
export function perCallRailFeeUsd(monthlyVolume: number): number {
  const metered =
    monthlyVolume > CDP_FREE_TIER_TX_PER_MONTH
      ? CDP_METERED_FEE_PER_CALL_USD
      : 0;
  return BASE_GAS_PER_CALL_USD + CDP_SETTLEMENT_FEE_USD + metered;
}

export function estimateX402RailCostUsd(
  options: LegacyRailCostOptions = {}
): number {
  const gasPerCallUsd = options.gasPerCallUsd ?? BASE_GAS_PER_CALL_USD;
  const settlementFeeUsd =
    options.facilitatorSettlementFeeUsd ?? CDP_SETTLEMENT_FEE_USD;
  const cdpMeteringPerTxUsd =
    options.cdpMeteringPerTxUsd ?? CDP_METERED_FEE_PER_CALL_USD;
  const metered = options.aboveCdpFreeTier ?? true;
  return gasPerCallUsd + settlementFeeUsd + (metered ? cdpMeteringPerTxUsd : 0);
}

/**
 * Share of the price eaten by payment rails: percentage off-ramp plus the fixed
 * per-call fee amortized over the price. railOverhead = offRampRate + fixedFee/price.
 */
export function railOverheadRatio(
  priceUsd: number,
  monthlyVolume: number,
  offRampRate: number = OFFRAMP_RATE_WORST_CASE
): number {
  if (priceUsd <= 0) return Number.POSITIVE_INFINITY;
  return offRampRate + perCallRailFeeUsd(monthlyVolume) / priceUsd;
}

/**
 * Minimum per-call price at which rail overhead stays at/below `maxRailOverhead`.
 * Closed form: price >= fixedFee / (maxRailOverhead - offRampRate).
 * Returns Infinity if the off-ramp rate alone already exceeds the budget.
 */
export function minViablePriceUsd(
  monthlyVolume: number,
  offRampRate: number = OFFRAMP_RATE_WORST_CASE,
  maxRailOverhead: number = MAX_RAIL_OVERHEAD
): number {
  const budget = maxRailOverhead - offRampRate;
  if (budget <= 0) return Number.POSITIVE_INFINITY;
  return perCallRailFeeUsd(monthlyVolume) / budget;
}

export function minimumViableX402PriceUsd(
  options: LegacyRailCostOptions = {}
): number {
  const offRampRate = options.offRampFeeRate ?? 0.0075;
  const budget = MAX_RAIL_OVERHEAD - offRampRate;
  if (budget <= 0) return Number.POSITIVE_INFINITY;
  return estimateX402RailCostUsd(options) / budget;
}

export function evaluateX402UnitEconomics(
  priceUsd: number,
  options: LegacyRailCostOptions = {}
): LegacyUnitEconomicsResult {
  const railCostUsd = estimateX402RailCostUsd(options);
  const offRampRate = options.offRampFeeRate ?? 0.0075;
  const offRampCostUsd = Math.max(priceUsd, 0) * offRampRate;
  const totalRailCostUsd = railCostUsd + offRampCostUsd;
  const grossMarginRate =
    priceUsd > 0 ? 1 - totalRailCostUsd / priceUsd : Number.NEGATIVE_INFINITY;
  return {
    priceUsd,
    railCostUsd,
    offRampCostUsd,
    totalRailCostUsd,
    grossMarginRate,
    clearsMarginGate: grossMarginRate >= X402_MIN_GROSS_MARGIN_RATE,
  };
}

export function recommendedFloorClearsMarginGate(): boolean {
  return evaluateX402UnitEconomics(X402_RECOMMENDED_PRICE_FLOOR_USD)
    .clearsMarginGate;
}

/** Does this price clear the rail-overhead gate at the given volume? */
export function clearsRailGate(
  priceUsd: number,
  monthlyVolume: number,
  offRampRate: number = OFFRAMP_RATE_WORST_CASE,
  maxRailOverhead: number = MAX_RAIL_OVERHEAD
): boolean {
  return (
    railOverheadRatio(priceUsd, monthlyVolume, offRampRate) <= maxRailOverhead
  );
}

/**
 * The three price points shipped in Cloudflare's x402 Worker template README
 * (`PROTECTED_PATTERNS`), modeled at a metered (>free-tier) volume so the fixed
 * fee applies. Demonstrates per-resource pricing clearing the gate above ~$0.0023.
 */
export const TEMPLATE_PRICE_POINTS_USD = [0.01, 0.1, 1.0] as const;
