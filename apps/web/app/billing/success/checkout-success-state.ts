import { APP_ROUTES } from '@/constants/routes';
import { PRO_PLAN_DISPLAY_NAME } from '@/lib/config/plan-prices';
import {
  getLimit,
  getPlanDisplayName,
  type PlanId,
  resolveCanonicalPlanId,
} from '@/lib/entitlements/registry';

export type PaidPlanId = Exclude<PlanId, 'free'>;
export type CheckoutSuccessView =
  | { readonly kind: 'pending'; readonly reason: 'session' | 'billing' }
  | {
      readonly kind: 'recovery';
      readonly reason: 'session_unconfirmed' | 'not_entitled';
    }
  | {
      readonly kind: 'success';
      readonly plan: PaidPlanId;
      readonly displayName: string;
    };

export const CHECKOUT_PENDING_COPY = {
  title: 'Confirming checkout',
  subtitle: 'We are verifying this payment before we mark a plan as active.',
} as const;

export const CHECKOUT_RECOVERY_COPY = {
  title: 'Checkout not confirmed',
  subtitle:
    'This session is missing, expired, or still processing. We have not marked a paid plan as active.',
} as const;

/**
 * Post-checkout copy names only what the paid plan turns on today
 * (registry-gated and certified). Monitoring, opportunities and agentic fixes
 * are internal-only (PROFILE_SEARCH_MONITORING off), so they are not promised.
 */
const PRO_ANALYTICS_DAYS = getLimit('pro', 'analyticsRetentionDays');

export const ARTIST_VISIBILITY_ACTIVATION_COPY = {
  status: `${PRO_PLAN_DISPLAY_NAME} is active`,
  next: 'Included with your plan.',
} as const;

export const ARTIST_VISIBILITY_ACTIVATION_STEPS = [
  {
    key: 'notify',
    title: 'Release emails',
    description:
      'When a new release reaches Spotify, Jovie emails your verified subscribers.',
    status: 'On for your next release',
  },
  {
    key: 'prerelease',
    title: 'Pre-release pages',
    description:
      'Countdown and pre-release pages stay live through release day.',
    status: 'Unlocked',
  },
  {
    key: 'analytics',
    title: 'Analytics',
    description: `${PRO_ANALYTICS_DAYS} days of history, geographic insights and contact export.`,
    status: 'Unlocked',
  },
  {
    key: 'verify',
    title: 'Verification',
    description: 'Request a verified badge. Our team reviews each request.',
    status: 'Available to request',
  },
] as const;

export function resolvePaidPlan(
  plan: string | null | undefined
): PaidPlanId | null {
  const canonical = resolveCanonicalPlanId(plan);
  return canonical && canonical !== 'free' ? canonical : null;
}

export function resolveCanonicalPlan(
  billingPlan: string | null | undefined,
  rawPlanIdParam: string | null,
  validatedSessionPlan: PaidPlanId | null
): {
  readonly canonical: PaidPlanId | null;
  readonly displayName: string | null;
} {
  const fromBilling = resolvePaidPlan(billingPlan ?? null);
  const fromParam = resolvePaidPlan(rawPlanIdParam);
  const validatedParam =
    fromParam &&
    (fromParam === validatedSessionPlan ||
      (!validatedSessionPlan && fromParam === fromBilling))
      ? fromParam
      : null;
  const canonicalPlan = validatedParam ?? validatedSessionPlan ?? fromBilling;
  return canonicalPlan
    ? {
        canonical: canonicalPlan,
        displayName: getPlanDisplayName(canonicalPlan),
      }
    : { canonical: null, displayName: null };
}

export function resolveCheckoutSuccessView(input: {
  readonly checkoutSessionId: string | null;
  readonly isSessionPlanPending: boolean;
  readonly validatedSessionPlan: PaidPlanId | null;
  readonly billingPlan: string | null | undefined;
  readonly isBillingPending: boolean;
}): CheckoutSuccessView {
  const billingEntitlement = resolvePaidPlan(input.billingPlan);
  if (input.checkoutSessionId) {
    if (input.isSessionPlanPending)
      return { kind: 'pending', reason: 'session' };
    if (!input.validatedSessionPlan) {
      return { kind: 'recovery', reason: 'session_unconfirmed' };
    }
    return {
      kind: 'success',
      plan: input.validatedSessionPlan,
      displayName: getPlanDisplayName(input.validatedSessionPlan),
    };
  }
  if (input.isBillingPending) return { kind: 'pending', reason: 'billing' };
  if (billingEntitlement) {
    return {
      kind: 'success',
      plan: billingEntitlement,
      displayName: getPlanDisplayName(billingEntitlement),
    };
  }
  return { kind: 'recovery', reason: 'not_entitled' };
}

export function isArtistVisibilityPlan(plan: PaidPlanId): boolean {
  return plan === 'pro' || plan === 'trial';
}

export function getPaidSuccessPrimaryHref(input: {
  readonly plan: PaidPlanId;
  readonly isOnboardingUpgrade: boolean;
  /** Paid before claiming a link: claim or create it next. */
  readonly needsProfile?: boolean;
}): string {
  if (input.isOnboardingUpgrade) return APP_ROUTES.DASHBOARD;
  if (input.needsProfile) return APP_ROUTES.START;
  return isArtistVisibilityPlan(input.plan)
    ? APP_ROUTES.PRESENCE
    : APP_ROUTES.CHAT;
}

export function getPaidSuccessPrimaryLabel(input: {
  readonly plan: PaidPlanId;
  readonly isOnboardingUpgrade: boolean;
  readonly needsProfile?: boolean;
}): string {
  if (input.isOnboardingUpgrade) return 'Explore your dashboard';
  if (input.needsProfile) return 'Claim your link';
  return isArtistVisibilityPlan(input.plan) ? 'Open Identity' : 'Go to chat';
}

export function shouldCelebratePaidSuccess(
  view: CheckoutSuccessView
): view is Extract<CheckoutSuccessView, { kind: 'success' }> {
  return view.kind === 'success';
}
