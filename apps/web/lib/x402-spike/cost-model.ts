/**
 * Unit economics for x402-priced artist resources (GitHub #12750).
 * Sources cited in docs/product/x402-payment-gated-artist-resources-spike.md.
 */

export type X402PricingLane =
  | 'worker-template'
  | 'pay-per-crawl'
  | 'monetization-gateway';

export interface X402CostBreakdown {
  readonly lane: X402PricingLane;
  readonly label: string;
  readonly facilitatorFeePerTx: number;
  readonly gasEstimatePerTx: number;
  readonly cloudflareOverheadPerTx: number;
  readonly fullyLoadedPerTx: number;
  readonly minimumViablePriceUsd: number;
  readonly notes: readonly string[];
}

/** CDP / x402.org facilitator — sub-cent verify+settle on Base (public docs, Jul 2026). */
export const X402_FACILITATOR_FEE_ESTIMATE = 0.0001;

/** Base L2 USDC transfer gas — negligible vs price floor at micropayment scale. */
export const BASE_USDC_GAS_ESTIMATE = 0.00005;

/** Worker CPU + facilitator round-trip — spike estimate for edge verify path. */
export const X402_EDGE_OVERHEAD_ESTIMATE = 0.0005;

/** Pay Per Crawl published zone pricing floor (varies by zone; use conservative $0.01). */
export const PAY_PER_CRAWL_ZONE_FLOOR_USD = 0.01;

export function getWorkerTemplateCostBreakdown(): X402CostBreakdown {
  const fullyLoaded =
    X402_FACILITATOR_FEE_ESTIMATE +
    BASE_USDC_GAS_ESTIMATE +
    X402_EDGE_OVERHEAD_ESTIMATE;
  return {
    lane: 'worker-template',
    label: 'x402-proxy Worker template (per protected request)',
    facilitatorFeePerTx: X402_FACILITATOR_FEE_ESTIMATE,
    gasEstimatePerTx: BASE_USDC_GAS_ESTIMATE,
    cloudflareOverheadPerTx: X402_EDGE_OVERHEAD_ESTIMATE,
    fullyLoadedPerTx: fullyLoaded,
    minimumViablePriceUsd: 0.01,
    notes: [
      'PROTECTED_PATTERNS supports per-route price (e.g. $0.01 MCP, $0.05 press-kit).',
      'JWT cookie amortizes cost over 1h session after first payment.',
      'Price floor $0.01 — below that, rail cost exceeds artist take at low volume.',
    ],
  };
}

export function getPayPerCrawlCostBreakdown(): X402CostBreakdown {
  return {
    lane: 'pay-per-crawl',
    label: 'Pay Per Crawl (zone-level crawler pricing)',
    facilitatorFeePerTx: X402_FACILITATOR_FEE_ESTIMATE,
    gasEstimatePerTx: BASE_USDC_GAS_ESTIMATE,
    cloudflareOverheadPerTx: 0,
    fullyLoadedPerTx:
      PAY_PER_CRAWL_ZONE_FLOOR_USD +
      X402_FACILITATOR_FEE_ESTIMATE +
      BASE_USDC_GAS_ESTIMATE,
    minimumViablePriceUsd: PAY_PER_CRAWL_ZONE_FLOOR_USD,
    notes: [
      'One price per crawl zone — not per MCP tool or press-kit asset.',
      'Native Cloudflare integration; no Worker deploy required.',
      'Best for bulk crawler traffic, not per-tool granularity.',
    ],
  };
}

export function getMonetizationGatewayCostBreakdown(): X402CostBreakdown {
  const worker = getWorkerTemplateCostBreakdown();
  return {
    lane: 'monetization-gateway',
    label: 'Monetization Gateway (rules API — waitlist)',
    facilitatorFeePerTx: worker.facilitatorFeePerTx,
    gasEstimatePerTx: worker.gasEstimatePerTx,
    cloudflareOverheadPerTx: worker.cloudflareOverheadPerTx,
    fullyLoadedPerTx: worker.fullyLoadedPerTx,
    minimumViablePriceUsd: worker.minimumViablePriceUsd,
    notes: [
      'Waitlist-only (Jul 2026) — replaces DIY Worker for rules + settlement UX.',
      'Stablecoin receipt → fiat redemption via seller wallet / CDP (human onboarding).',
      'Web Bot Auth + variable pricing planned in rules API.',
    ],
  };
}

export function compareX402Lanes(): {
  readonly workerTemplate: X402CostBreakdown;
  readonly payPerCrawl: X402CostBreakdown;
  readonly monetizationGateway: X402CostBreakdown;
  readonly artistNetAtOneCent: number;
  readonly artistNetAtFiveCents: number;
} {
  const workerTemplate = getWorkerTemplateCostBreakdown();
  const payPerCrawl = getPayPerCrawlCostBreakdown();
  const monetizationGateway = getMonetizationGatewayCostBreakdown();
  return {
    workerTemplate,
    payPerCrawl,
    monetizationGateway,
    artistNetAtOneCent: 0.01 - workerTemplate.fullyLoadedPerTx,
    artistNetAtFiveCents: 0.05 - workerTemplate.fullyLoadedPerTx,
  };
}

export function estimateMonthlyVolume(
  callsPerDay: number,
  priceUsd: number
): {
  readonly grossUsd: number;
  readonly netUsd: number;
  readonly railCostUsd: number;
} {
  const worker = getWorkerTemplateCostBreakdown();
  const grossUsd = callsPerDay * 30 * priceUsd;
  const railCostUsd = callsPerDay * 30 * worker.fullyLoadedPerTx;
  return { grossUsd, netUsd: grossUsd - railCostUsd, railCostUsd };
}
