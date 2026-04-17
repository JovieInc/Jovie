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
  /** Whether the user has any paid plan (pro or max) */
  isPro: boolean;
  /** User's current plan */
  plan: string | null;
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
  /** AI: can use tools (pro/max) */
  aiCanUseTools: boolean;
  /** Pro: can create releases manually (not just auto-sync) */
  canCreateManualReleases: boolean;
  /** Pro: can access the Tasks workspace */
  canAccessTasksWorkspace: boolean;
  /** Pro: can generate release plans */
  canGenerateReleasePlans: boolean;
  /** Pro: can generate album art from chat */
  canGenerateAlbumArt: boolean;
  /** Pro: can access metadata submission workflows */
  canAccessMetadataSubmissionAgent: boolean;
  /** Pro: can access future/unreleased release smartlinks */
  canAccessFutureReleases: boolean;
  /** Pro: can send notifications to subscribers */
  canSendNotifications: boolean;
  /** Pro: can edit smartlink content (artwork, links, slugs) */
  canEditSmartLinks: boolean;
  /** Max: can access pre-save campaigns */
  canAccessPreSave: boolean;
  /** Max: can access fan tipping */
  canAccessTipping: boolean;
  /** Max: can access URL encryption */
  canAccessUrlEncryption: boolean;
  /** Max: can access Stripe Connect payouts */
  canAccessStripeConnect: boolean;
  /** Max: can access fan subscriptions */
  canAccessFanSubscriptions: boolean;
  /** Max: can access email campaigns */
  canAccessEmailCampaigns: boolean;
  /** Max: can access API keys */
  canAccessApiKeys: boolean;
  /** Max: can access team management */
  canAccessTeamManagement: boolean;
  /** Max: can access webhooks */
  canAccessWebhooks: boolean;
  /** Max: can access white-label features */
  canAccessWhiteLabel: boolean;
  /** Max: can access A/B testing */
  canAccessAbTesting: boolean;
  /** Analytics retention days based on plan */
  analyticsRetentionDays: number | null;
  /** Contact limit based on plan (null = unlimited) */
  contactsLimit: number | null;
  /** Smart link limit based on plan (null = unlimited) */
  smartLinksLimit: number | null;
  /** AI daily message limit based on plan */
  aiDailyMessageLimit: number;
  /** AI pitch generations per release based on plan (null = unlimited) */
  aiPitchGenPerRelease: number | null;
  /** Whether the user is on an active trial */
  isTrialing: boolean;
  /** Days remaining in the trial (null if not trialing) */
  trialDaysRemaining: number | null;
  /** ISO date string when trial ends (null if not trialing) */
  trialEndsAt: string | null;
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

  const isTrialing = plan === 'trial';

  let planKey: PlanId;
  if (plan === 'max' || plan === 'growth') {
    planKey = 'max';
  } else if (plan === 'trial') {
    planKey = 'trial';
  } else if (plan === 'pro' || plan === 'founding') {
    planKey = 'pro';
  } else {
    planKey = 'free';
  }
  const ent = ENTITLEMENT_REGISTRY[planKey];

  // Derive trial days remaining from trialEndsAt if available
  const trialEndsAt =
    ((data as Record<string, unknown> | undefined)?.trialEndsAt as
      | string
      | null) ?? null;
  let trialDaysRemaining: number | null = null;
  if (isTrialing && trialEndsAt) {
    const msRemaining = new Date(trialEndsAt).getTime() - Date.now();
    trialDaysRemaining = Math.max(
      0,
      Math.floor(msRemaining / (1000 * 60 * 60 * 24))
    );
  }

  return {
    isLoading,
    isError,
    isPro,
    plan,
    isTrialing,
    trialDaysRemaining,
    trialEndsAt,
    ...ent.booleans,
    ...ent.limits,
  };
}
