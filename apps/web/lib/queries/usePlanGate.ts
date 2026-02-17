'use client';

/**
 * Plan gate hook for client-side feature gating by subscription plan.
 *
 * Derives all entitlements from the central ENTITLEMENT_REGISTRY so there is
 * a single source of truth for plan features.
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

import { ENTITLEMENT_REGISTRY, type PlanId } from '@/lib/entitlements/registry';
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
  /** Pro: can be verified */
  canBeVerified: boolean;
  /** AI: can use tools (pro/growth) */
  aiCanUseTools: boolean;
  /** Analytics retention days based on plan */
  analyticsRetentionDays: number;
  /** Contact limit based on plan (null = unlimited) */
  contactsLimit: number | null;
  /** Smart link limit based on plan (null = unlimited) */
  smartLinksLimit: number | null;
  /** AI daily message limit based on plan */
  aiDailyMessageLimit: number;
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

  const planKey: PlanId =
    plan === 'growth' ? 'growth' : plan === 'pro' ? 'pro' : 'free';
  const ent = ENTITLEMENT_REGISTRY[planKey];

  return {
    isLoading,
    isError,
    isPro,
    plan,
    ...ent.booleans,
    ...ent.limits,
  };
}
