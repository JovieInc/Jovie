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
  | { readonly kind: 'pending'; readonly reason: 'session' }
  | {
      readonly kind: 'recovery';
      readonly reason: 'session_unconfirmed' | 'not_entitled';
    }
  | {
      readonly kind: 'success';
      readonly plan: PaidPlanId;
      readonly displayName: string;
      readonly paymentStatus: 'paid' | 'no_payment_required';
    };

export const CHECKOUT_PENDING_COPY = {
  title: 'Confirming checkout',
  subtitle:
    'We are checking your checkout and plan. Please do not start another payment.',
} as const;

export const CHECKOUT_RECOVERY_COPY = {
  title: 'Checkout not confirmed',
  subtitle:
    'We could not confirm this checkout and active plan yet. Check again or view Billing before making another payment.',
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

/**
 * The one thing only the paid plan unlocks that works the moment checkout
 * lands: contact export (`canExportContacts` is false on Free, true on the
 * paid plan; POST /api/dashboard/audience/subscribers returns 403 without
 * it). The CSV columns match SUBSCRIBER_EXPORT_COLUMNS in the audience
 * toolbar: name, email, country, consent date.
 */
export const ARTIST_VISIBILITY_FAN_LIST_UNLOCK = {
  header: `You're on ${PRO_PLAN_DISPLAY_NAME}: unlocked`,
  title: 'Your fan list: export',
  description:
    'Fans who subscribe on your page are yours to export anytime with name, email, country and consent date.',
  cta: 'Open your fan list',
  href: APP_ROUTES.CONTACTS_AUDIENCE,
} as const;

/** Day one the fan list is empty, so the first action is filling it. */
export const ARTIST_VISIBILITY_SHARE_PROMPT = {
  title: 'Share your page to collect your first fans',
  shareLabel: 'Share',
  shareText: 'Subscribe to hear when I release new music.',
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

export function resolveCheckoutSuccessView(input: {
  readonly checkoutSessionId: string | null;
  readonly isSessionPlanPending: boolean;
  readonly validatedSessionPlan: PaidPlanId | null;
  readonly confirmationStatus: string;
  readonly paymentStatus: 'paid' | 'no_payment_required' | null;
}): CheckoutSuccessView {
  if (input.checkoutSessionId && input.isSessionPlanPending) {
    return { kind: 'pending', reason: 'session' };
  }
  if (
    input.checkoutSessionId &&
    input.confirmationStatus === 'confirmed' &&
    input.validatedSessionPlan &&
    input.paymentStatus
  ) {
    return {
      kind: 'success',
      plan: input.validatedSessionPlan,
      displayName: getPlanDisplayName(input.validatedSessionPlan),
      paymentStatus: input.paymentStatus,
    };
  }
  return { kind: 'recovery', reason: 'session_unconfirmed' };
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
