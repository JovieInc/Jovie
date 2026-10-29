import { getProductCapability } from '@/data/product-truth/registry';
import {
  type ComparisonFeature,
  PRICING_COMPARISON,
  type PricingCategory,
} from '@/lib/entitlements/registry';

/** Plans the public comparison shows (Max is legacy-only, not sold). */
export type PublicComparisonPlan = 'free' | 'pro';

/**
 * True when a row may appear on public pricing: a sold plan includes it, it is
 * not roadmap, and a certified, generally available product-truth capability
 * proves it (public, proof-authorized, not proposed, not unavailable).
 */
export function isPublicPricingFeature(feature: ComparisonFeature): boolean {
  if (feature.comingSoon) return false;
  if (feature.free === false && feature.pro === false) return false;
  const capability = getProductCapability(feature.capabilityId);
  return (
    capability !== null &&
    capability.publication === 'public' &&
    capability.maturity === 'general_availability' &&
    capability.access !== 'unavailable' &&
    capability.marketing?.proofAuthorized === true
  );
}

/**
 * Public projection of the entitlement registry's PRICING_COMPARISON. Every
 * row comes from the registry; this only drops rows a buyer cannot rely on
 * today. Server-only callers pass the result to the client chart so the
 * product-truth registry stays out of the client bundle.
 */
export function getPublicPricingComparison(): readonly PricingCategory[] {
  return PRICING_COMPARISON.map(category => ({
    category: category.category,
    features: category.features.filter(isPublicPricingFeature),
  })).filter(category => category.features.length > 0);
}
