import { computeRatePercent } from '@/lib/analytics/metrics';
import { requireClaim } from '@/lib/billing/offer/claims';

export function getAnnualSavingsPercent(
  monthlyAmount: number,
  annualAmount: number
): number {
  const yearlyAtMonthly = monthlyAmount * 12;
  return computeRatePercent(yearlyAtMonthly - annualAmount, yearlyAtMonthly, 0);
}

export function getCheckoutHeaderHint(params: {
  readonly isDefaultUpsell: boolean;
  readonly username: string;
  readonly displayName: string;
  readonly canClaimLive: boolean;
  readonly proofPending: boolean;
}): string {
  const { isDefaultUpsell, username, displayName, canClaimLive, proofPending } =
    params;
  if (proofPending) {
    return `Here's what ${displayName} adds once your profile is verified.`;
  }
  if (!canClaimLive) {
    return `Here's what ${displayName} adds to your profile.`;
  }
  if (isDefaultUpsell && username) {
    return `Your profile, links, and fan capture are live at jov.ie/${username}. ${requireClaim('price.free')} Here's what ${displayName} adds on top.`;
  }
  if (username) {
    return `Your profile is live and stays free either way. Here's what ${displayName} adds on top.`;
  }
  return `Here's what ${displayName} adds on top of the free plan.`;
}
