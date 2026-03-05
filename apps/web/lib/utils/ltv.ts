/**
 * Lifetime Value (LTV) tier calculation for audience members.
 *
 * Tiers are based on total tip amount:
 * - '$'   = low    (< $5 in tips)
 * - '$$'  = medium ($5–$25 in tips)
 * - '$$$' = high   (> $25 in tips)
 *
 * Members with zero tips and low engagement are considered "none" tier.
 */

export type LtvTier = 'none' | 'low' | 'medium' | 'high';

export interface LtvBreakdown {
  tier: LtvTier;
  /** Display label: "$", "$$", "$$$", or "—" */
  label: string;
  /** Total tip amount in dollars */
  tipTotalDollars: number;
  /** Number of tips sent */
  tipCount: number;
  /** Number of visits */
  visits: number;
  /** Engagement score (0–100) */
  engagementScore: number;
}

/**
 * Calculate LTV tier and breakdown from audience member data.
 */
export function calculateLtv(params: {
  tipAmountTotalCents: number;
  tipCount: number;
  visits: number;
  engagementScore: number;
}): LtvBreakdown {
  const tipTotalDollars = params.tipAmountTotalCents / 100;

  let tier: LtvTier;
  let label: string;

  if (tipTotalDollars >= 25) {
    tier = 'high';
    label = '$$$';
  } else if (tipTotalDollars >= 5) {
    tier = 'medium';
    label = '$$';
  } else if (tipTotalDollars > 0) {
    tier = 'low';
    label = '$';
  } else {
    tier = 'none';
    label = '\u2014'; // em-dash
  }

  return {
    tier,
    label,
    tipTotalDollars,
    tipCount: params.tipCount,
    visits: params.visits,
    engagementScore: params.engagementScore,
  };
}
