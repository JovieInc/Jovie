/**
 * Unit-economics model for x402-priced artist resources (Monetization Gateway P2 spike).
 *
 * Sources: Cloudflare x402 docs, CDP facilitator pricing (2026-07), PRICING-PHILOSOPHY Principle 7.
 * UNVERIFIED items are flagged in the spike report — do not treat as production constants.
 */

/** Minimum gross margin required per PRICING-PHILOSOPHY Principle 7. */
export const X402_MIN_GROSS_MARGIN_RATE = 0.5;

/** Recommended price floor for artist resources (USD). */
export const X402_RECOMMENDED_PRICE_FLOOR_USD = 0.01;

export const BASE_GAS_PER_CALL_USD = 0.0001;
export const CDP_FREE_TIER_TX_PER_MONTH = 1_000;
export const CDP_METERED_FEE_PER_CALL_USD = 0.001;
export const OFFRAMP_RATE_WORST_CASE = 0.015;
export const MAX_RAIL_OVERHEAD = 1 - X402_MIN_GROSS_MARGIN_RATE;
export const TEMPLATE_PRICE_POINTS_USD = [0.01, 0.05, 0.1, 0.25] as const;

export interface X402RailCostInputs {
  /** Facilitator settlement fee per transaction (USD). Base/CDP: $0 at time of spike. */
  readonly facilitatorSettlementFeeUsd: number;
  /** On-chain gas amortized per call (USD). Base mainnet: sub-cent. */
  readonly gasPerCallUsd: number;
  /** CDP metering fee per tx above free tier (USD). $0.001/tx above 1,000/mo. */
  readonly cdpMeteringPerTxUsd: number;
  /** Whether monthly volume exceeds CDP free tier (1,000 tx/mo). */
  readonly aboveCdpFreeTier: boolean;
  /** Off-ramp fee as a fraction of gross (0–0.015). Batched USDC→fiat sweep. */
  readonly offRampFeeRate: number;
}

export interface X402UnitEconomicsResult {
  readonly priceUsd: number;
  readonly railCostUsd: number;
  readonly offRampCostUsd: number;
  readonly totalCostUsd: number;
  readonly grossMarginUsd: number;
  readonly grossMarginRate: number;
  readonly clearsMarginGate: boolean;
  readonly minimumViablePriceUsd: number;
}

const DEFAULT_RAIL_INPUTS: X402RailCostInputs = {
  facilitatorSettlementFeeUsd: 0,
  gasPerCallUsd: BASE_GAS_PER_CALL_USD,
  cdpMeteringPerTxUsd: CDP_METERED_FEE_PER_CALL_USD,
  aboveCdpFreeTier: true,
  offRampFeeRate: 0.0075,
};

/**
 * Fixed per-call rail cost before off-ramp (facilitator + gas + optional CDP metering).
 */
export function estimateX402RailCostUsd(
  inputs: X402RailCostInputs = DEFAULT_RAIL_INPUTS
): number {
  const metering = inputs.aboveCdpFreeTier ? inputs.cdpMeteringPerTxUsd : 0;
  return inputs.facilitatorSettlementFeeUsd + inputs.gasPerCallUsd + metering;
}

/**
 * Minimum price that clears the ≥50% gross-margin gate at expected rail + off-ramp cost.
 */
export function minimumViableX402PriceUsd(
  inputs: X402RailCostInputs = DEFAULT_RAIL_INPUTS,
  marginRate: number = X402_MIN_GROSS_MARGIN_RATE
): number {
  const rail = estimateX402RailCostUsd(inputs);
  // totalCost = rail + price * offRampRate; margin = (price - totalCost) / price >= marginRate
  // => price >= rail / (1 - offRampRate - marginRate)
  const denominator = 1 - inputs.offRampFeeRate - marginRate;
  if (denominator <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return rail / denominator;
}

/**
 * Evaluate unit economics for a single x402-priced resource call.
 */
export function evaluateX402UnitEconomics(
  priceUsd: number,
  inputs: X402RailCostInputs = DEFAULT_RAIL_INPUTS,
  marginRate: number = X402_MIN_GROSS_MARGIN_RATE
): X402UnitEconomicsResult {
  const railCostUsd = estimateX402RailCostUsd(inputs);
  const offRampCostUsd = priceUsd * inputs.offRampFeeRate;
  const totalCostUsd = railCostUsd + offRampCostUsd;
  const grossMarginUsd = priceUsd - totalCostUsd;
  const grossMarginRate = priceUsd > 0 ? grossMarginUsd / priceUsd : 0;

  return {
    priceUsd,
    railCostUsd,
    offRampCostUsd,
    totalCostUsd,
    grossMarginUsd,
    grossMarginRate,
    clearsMarginGate: grossMarginRate >= marginRate,
    minimumViablePriceUsd: minimumViableX402PriceUsd(inputs, marginRate),
  };
}

/**
 * Returns true when the recommended $0.01 floor clears the margin gate with default rails.
 */
export function recommendedFloorClearsMarginGate(
  inputs: X402RailCostInputs = DEFAULT_RAIL_INPUTS
): boolean {
  return evaluateX402UnitEconomics(X402_RECOMMENDED_PRICE_FLOOR_USD, inputs)
    .clearsMarginGate;
}

export function perCallRailFeeUsd(monthlyTransactions: number): number {
  return estimateX402RailCostUsd({
    ...DEFAULT_RAIL_INPUTS,
    aboveCdpFreeTier: monthlyTransactions > CDP_FREE_TIER_TX_PER_MONTH,
    offRampFeeRate: OFFRAMP_RATE_WORST_CASE,
  });
}

export function railOverheadRatio(
  priceUsd: number,
  monthlyTransactions: number,
  offRampRate: number = OFFRAMP_RATE_WORST_CASE
): number {
  if (priceUsd <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return offRampRate + perCallRailFeeUsd(monthlyTransactions) / priceUsd;
}

export function minViablePriceUsd(
  monthlyTransactions: number,
  offRampRate: number = OFFRAMP_RATE_WORST_CASE,
  maxRailOverhead: number = MAX_RAIL_OVERHEAD
): number {
  const denominator = maxRailOverhead - offRampRate;
  if (denominator <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return perCallRailFeeUsd(monthlyTransactions) / denominator;
}

export function clearsRailGate(
  priceUsd: number,
  monthlyTransactions: number,
  offRampRate: number = OFFRAMP_RATE_WORST_CASE
): boolean {
  return (
    railOverheadRatio(priceUsd, monthlyTransactions, offRampRate) <=
    MAX_RAIL_OVERHEAD
  );
}
