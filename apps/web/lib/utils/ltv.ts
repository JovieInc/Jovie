/**
 * Lifetime Value (LTV) tier calculation for audience members.
 *
 * Derived from tracked behavior with intentionally conservative defaults:
 * - Streaming click-throughs: $0.01 each (intent signal)
 * - Tip click-throughs: assumed conversion; defaults to $5 when amount missing
 * - Merch sales: actual tracked cents
 * - Ticket sales: actual tracked cents
 */

export type LtvTier = 'none' | 'low' | 'medium' | 'high';

const STREAMING_CLICK_VALUE_CENTS = 1;

const LTV_TIER_THRESHOLDS = {
  medium: 1_000,
  high: 4_000,
} as const;

export interface LtvBreakdown {
  tier: LtvTier;
  /** Display label: "$", "$$", "$$$", or "—" */
  label: string;
  /** Total LTV in cents */
  totalValueCents: number;
  /** Estimated value from streaming click-throughs */
  streamingValueCents: number;
  /** Assumed conversion value from tip clicks */
  tipClickValueCents: number;
  /** Actual tracked merch sales */
  merchSalesCents: number;
  /** Actual tracked ticket sales */
  ticketSalesCents: number;
  /** Number of streaming click-throughs */
  streamingClicks: number;
  /** Number of tips sent */
  tipCount: number;
  /** Number of profile visits */
  visits: number;
  /** Engagement score (0–100+) */
  engagementScore: number;
}

/**
 * Calculate LTV tier and breakdown from audience member tracking data.
 */
export function calculateLtv(params: {
  tipAmountTotalCents: number;
  tipCount: number;
  visits: number;
  engagementScore: number;
  streamingClicks?: number;
  tipClickValueCents?: number;
  merchSalesCents?: number;
  ticketSalesCents?: number;
}): LtvBreakdown {
  const streamingClicks = Math.max(0, params.streamingClicks ?? 0);
  const streamingValueCents = streamingClicks * STREAMING_CLICK_VALUE_CENTS;
  const tipValueCents = Math.max(
    params.tipAmountTotalCents,
    params.tipClickValueCents ?? 0
  );
  const merchSalesCents = Math.max(0, params.merchSalesCents ?? 0);
  const ticketSalesCents = Math.max(0, params.ticketSalesCents ?? 0);

  const totalValueCents =
    streamingValueCents + tipValueCents + merchSalesCents + ticketSalesCents;

  let tier: LtvTier = 'none';
  let label = '—';

  if (totalValueCents >= LTV_TIER_THRESHOLDS.high) {
    tier = 'high';
    label = '$$$';
  } else if (totalValueCents >= LTV_TIER_THRESHOLDS.medium) {
    tier = 'medium';
    label = '$$';
  } else if (totalValueCents > 0) {
    tier = 'low';
    label = '$';
  }

  return {
    tier,
    label,
    totalValueCents,
    streamingValueCents,
    tipClickValueCents: tipValueCents,
    merchSalesCents,
    ticketSalesCents,
    streamingClicks,
    tipCount: params.tipCount,
    visits: params.visits,
    engagementScore: params.engagementScore,
  };
}
