'use client';

/**
 * Plan gate hook for client-side feature gating by subscription plan.
 *
 * Provides a centralized way to check which features are unavailable
 * due to the user's current plan, and whether they need to upgrade.
 *
 * @example
 * ```tsx
 * function AnalyticsFilter() {
 *   const { canFilterSelfFromAnalytics, isPro, isLoading } = usePlanGate();
 *
 *   if (isLoading) return <Spinner />;
 *   if (!canFilterSelfFromAnalytics) return <UpgradePrompt />;
 *   return <FilterToggle />;
 * }
 * ```
 */

import { useBillingStatusQuery } from './useBillingStatusQuery';

/**
 * Feature entitlements derived from the user's plan.
 * Add new plan-gated features here.
 */
export interface PlanGateEntitlements {
  /** Whether the billing data is still loading */
  isLoading: boolean;
  /** Whether the user has any paid plan (pro or growth) */
  isPro: boolean;
  /** User's current plan */
  plan: string | null;
  /** Pro: can remove Jovie branding */
  canRemoveBranding: boolean;
  /** Pro: can access ad pixel integrations */
  canAccessAdPixels: boolean;
  /** Pro: can filter own traffic from analytics */
  canFilterSelfFromAnalytics: boolean;
  /** Pro: can access advanced analytics */
  canAccessAdvancedAnalytics: boolean;
  /** Pro: can export contacts */
  canExportContacts: boolean;
  /** Pro: can access tour dates */
  canAccessTourDates: boolean;
}

/**
 * Hook that derives plan-gated feature entitlements from billing status.
 *
 * All feature gates are derived from the billing query, so they share
 * the same cache (1 min stale, 10 min GC) and request deduplication.
 */
export function usePlanGate(): PlanGateEntitlements {
  const { data, isLoading } = useBillingStatusQuery();
  const isPro = data?.isPro ?? false;

  return {
    isLoading,
    isPro,
    plan: data?.plan ?? null,
    canRemoveBranding: isPro,
    canAccessAdPixels: isPro,
    canFilterSelfFromAnalytics: isPro,
    canAccessAdvancedAnalytics: isPro,
    canExportContacts: isPro,
    canAccessTourDates: isPro,
  };
}
