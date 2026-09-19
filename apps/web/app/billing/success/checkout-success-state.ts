import { APP_ROUTES } from '@/constants/routes';
import { ARTIST_VISIBILITY_OFFER } from '@/lib/config/plan-prices';
import {
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

export const ARTIST_VISIBILITY_ACTIVATION_COPY = {
  status: 'Artist Visibility is starting',
  next: 'We will monitor your presence, surface issues, wait for your approval, then fix.',
} as const;

export const ARTIST_VISIBILITY_ACTIVATION_STEPS = [
  {
    key: 'monitor',
    title: 'Monitor',
    description: ARTIST_VISIBILITY_OFFER.pro.outcomes[0],
    status: 'Starting',
  },
  {
    key: 'surface',
    title: 'Surface',
    description: 'Prioritized opportunities land here for you to review.',
    status: 'Waiting for first findings',
  },
  {
    key: 'approve',
    title: 'Approve',
    description: 'Nothing changes on a live surface until you approve.',
    status: 'You review before we act',
  },
  {
    key: 'fix',
    title: 'Fix',
    description: ARTIST_VISIBILITY_OFFER.pro.outcomes[2],
    status: 'Ready after you approve',
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
}): string {
  if (input.isOnboardingUpgrade) return APP_ROUTES.DASHBOARD;
  return isArtistVisibilityPlan(input.plan)
    ? APP_ROUTES.PROFILES
    : APP_ROUTES.CHAT;
}

export function getPaidSuccessPrimaryLabel(input: {
  readonly plan: PaidPlanId;
  readonly isOnboardingUpgrade: boolean;
}): string {
  if (input.isOnboardingUpgrade) return 'Explore your dashboard';
  return isArtistVisibilityPlan(input.plan)
    ? 'Open Artist Visibility'
    : 'Go to chat';
}

export function shouldCelebratePaidSuccess(
  view: CheckoutSuccessView
): view is Extract<CheckoutSuccessView, { kind: 'success' }> {
  return view.kind === 'success';
}
