import { PUBLIC_PRICING_COMPARISON } from '@/lib/billing/public-pricing-features';
import type {
  ComparisonFeature,
  PricingCategory,
} from '@/lib/entitlements/registry';

/** Plans the public comparison shows (Max is legacy-only, not sold). */
export type PublicComparisonPlan = 'free' | 'pro';

/**
 * True when a row may appear on public pricing. The public row set has one
 * source, `PUBLIC_PRICING_COMPARISON` (certified capabilities only), so the
 * comparison table and the paid plan card bullets cannot disagree. A row joins
 * public pricing only when its claim is certified there, never because a
 * nearby capability is.
 */
export function isPublicPricingFeature(feature: ComparisonFeature): boolean {
  if (feature.comingSoon) return false;
  return PUBLIC_PRICING_COMPARISON.some(category =>
    category.features.some(row => row.name === feature.name)
  );
}

/**
 * Public projection of the entitlement registry's PRICING_COMPARISON, passed
 * from the server page to the client chart.
 */
export function getPublicPricingComparison(): readonly PricingCategory[] {
  return PUBLIC_PRICING_COMPARISON;
}
