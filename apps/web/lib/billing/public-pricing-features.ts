import { PRICING_COMPARISON } from '@/lib/entitlements/registry';

/**
 * Public rows: certified capabilities only (product-truth publication=public,
 * proofAuthorized). Pro rows are entitlement-gated, so they are real differences.
 */
const PUBLIC_PRICING_FEATURE_NAMES = new Set([
  'Public Jovie profile page',
  'Audience email capture',
  'Release notifications (email to your audience)',
  'Pre-release & countdown pages',
]);

/** The comparison table rows shown on /pricing, derived from the plan registry. */
export const PUBLIC_PRICING_COMPARISON = PRICING_COMPARISON.map(category => ({
  ...category,
  features: category.features.filter(feature =>
    PUBLIC_PRICING_FEATURE_NAMES.has(feature.name)
  ),
})).filter(category => category.features.length > 0);

/**
 * Public features the paid plan includes and Free does not. Drives the paid
 * plan card bullets so the card and the comparison table cannot disagree.
 */
export function getPaidPlanAdditionNames(): readonly string[] {
  return PUBLIC_PRICING_COMPARISON.flatMap(category =>
    category.features
      .filter(feature => Boolean(feature.pro) && !feature.free)
      .map(feature => feature.name)
  );
}
