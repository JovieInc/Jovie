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
 * The 8 user states the upgrade-nudge system distinguishes between.
 *
 * `pro_paid` and `max_paid` render no nudges (slot hidden).
 * `trial_honeymoon` also renders no nudges (let the user feel ownership when
 * they have more than 3 days left). The other 5 states each render a distinct
 * sidebar slot variant.
 */
export type NudgeState =
  | 'never_trialed'
  | 'trial_honeymoon'
  | 'trial_late'
  | 'trial_last_day'
  | 'recently_lapsed'
  | 'stale_lapsed'
  | 'pro_paid'
  | 'max_paid';

const TRIAL_LATE_THRESHOLD_DAYS = 3;
const RECENTLY_LAPSED_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

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
  /** Days remaining in the trial (null if not trialing). Rounded DOWN. */
  trialDaysRemaining: number | null;
  /** ISO date string when trial ends (null if never trialed) */
  trialEndsAt: string | null;
  /** ISO date string when trial started (null if never trialed) */
  trialStartedAt: string | null;
  /** Number of notification recipients sent during the trial */
  trialNotificationsSent: number;
  /** State the upgrade-nudge system uses to pick what (if anything) to render. */
  nudgeState: NudgeState;
}

interface NudgeStateInput {
  plan: string | null;
  trialEndsAt: string | null;
  now: number;
}

/**
 * Derives the canonical nudge state from the raw plan + trial fields.
 *
 * Precedence (top wins):
 *   1. plan === 'max' or 'growth' → max_paid
 *   2. plan === 'pro' or 'founding' → pro_paid (Stripe past_due/paused/canceled
 *      stay pro_paid; dunning UX owns those states separately)
 *   3. plan === 'trial' AND trialEndsAt > now:
 *        - 0 calendar days remaining → trial_last_day
 *        - 1-3 days remaining → trial_late
 *        - else → trial_honeymoon
 *   4. plan === 'free' AND trialEndsAt set:
 *        - within last 30d → recently_lapsed
 *        - older → stale_lapsed
 *   5. plan === 'free' AND no trialEndsAt → never_trialed
 *   6. fallback → never_trialed
 *
 * Exported for unit tests.
 */
export function deriveNudgeState(input: NudgeStateInput): NudgeState {
  const { plan, trialEndsAt, now } = input;

  if (plan === 'max' || plan === 'growth') {
    return 'max_paid';
  }

  if (plan === 'pro' || plan === 'founding') {
    return 'pro_paid';
  }

  if (plan === 'trial') {
    if (!trialEndsAt) {
      // Defensive: trial plan with no end date shouldn't happen (activateTrial
      // always sets it). Default to honeymoon (silent banner) rather than
      // showing "Try Pro free" to a user who's already on trial.
      return 'trial_honeymoon';
    }
    const endTs = new Date(trialEndsAt).getTime();
    if (Number.isNaN(endTs)) {
      return 'trial_honeymoon';
    }
    const msRemaining = endTs - now;
    if (msRemaining <= 0) {
      return 'recently_lapsed';
    }
    const daysRemaining = Math.floor(msRemaining / DAY_MS);
    if (daysRemaining === 0) {
      return 'trial_last_day';
    }
    if (daysRemaining <= TRIAL_LATE_THRESHOLD_DAYS) {
      return 'trial_late';
    }
    return 'trial_honeymoon';
  }

  if (plan === 'free' && trialEndsAt) {
    const endTs = new Date(trialEndsAt).getTime();
    if (Number.isNaN(endTs)) {
      return 'never_trialed';
    }
    const daysSinceEnd = Math.floor((now - endTs) / DAY_MS);
    if (daysSinceEnd <= RECENTLY_LAPSED_WINDOW_DAYS) {
      return 'recently_lapsed';
    }
    return 'stale_lapsed';
  }

  return 'never_trialed';
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

  const trialEndsAt = data?.trialEndsAt ?? null;
  const trialStartedAt = data?.trialStartedAt ?? null;
  const trialNotificationsSent = data?.trialNotificationsSent ?? 0;

  let trialDaysRemaining: number | null = null;
  if (isTrialing && trialEndsAt) {
    const msRemaining = new Date(trialEndsAt).getTime() - Date.now();
    trialDaysRemaining = Math.max(0, Math.floor(msRemaining / DAY_MS));
  }

  const nudgeState = deriveNudgeState({
    plan,
    trialEndsAt,
    now: Date.now(),
  });

  return {
    isLoading,
    isError,
    isPro,
    plan,
    isTrialing,
    trialDaysRemaining,
    trialEndsAt,
    trialStartedAt,
    trialNotificationsSent,
    nudgeState,
    ...ent.booleans,
    ...ent.limits,
  };
}
