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
  /** Whether the billing lookup failed (503, network error, etc.) */
  isError: boolean;
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
  /** Analytics retention days based on plan (7 for free, 90 for pro) */
  analyticsRetentionDays: number;
  /** Contact limit based on plan (100 for free, null for unlimited) */
  contactsLimit: number | null;
  /** Smart link limit based on plan (5 for free, null for unlimited) */
  smartLinksLimit: number | null;
}

/** Map plan string to analytics retention days */
function getRetentionDays(plan: string | null): number {
  if (plan === 'growth') return 365;
  if (plan === 'pro') return 90;
  return 7;
}

/** Map plan string to contact limit */
function getContactsLimit(plan: string | null): number | null {
  if (plan === 'pro' || plan === 'growth') return null;
  return 100;
}

/** Map plan string to smart link limit (5 for free, unlimited for pro/growth) */
function getSmartLinksLimit(plan: string | null): number | null {
  if (plan === 'pro' || plan === 'growth') return null;
  return 5;
}

/**
 * Hook that derives plan-gated feature entitlements from billing status.
 *
 * All feature gates are derived from the billing query, so they share
 * the same cache (1 min stale, 10 min GC) and request deduplication.
 *
 * When billing lookup fails (isError=true), entitlements default to free-tier
 * values but isError is exposed so callers can show a retry/error state
 * instead of silently hiding pro features.
 */
export function usePlanGate(): PlanGateEntitlements {
  const { data, isLoading, isError } = useBillingStatusQuery();
  const isPro = data?.isPro ?? false;
  const plan = data?.plan ?? null;

  return {
    isLoading,
    isError,
    isPro,
    plan,
    canRemoveBranding: isPro,
    canAccessAdPixels: isPro,
    canFilterSelfFromAnalytics: isPro,
    canAccessAdvancedAnalytics: isPro,
    canExportContacts: isPro,
    analyticsRetentionDays: getRetentionDays(plan),
    contactsLimit: getContactsLimit(plan),
    smartLinksLimit: getSmartLinksLimit(plan),
  };
}
