import type { PlanIntentTier } from '@/lib/auth/plan-intent';
import {
  DEFAULT_UPSELL_PLAN,
  getPlanIntentFromCookies,
  isPaidIntent,
  recommendPlan,
  validatePlan,
} from '@/lib/auth/plan-intent';

export interface ResolveCheckoutPlanInput {
  readonly cookieHeader: string;
  readonly planParam: string | null;
  readonly sourceParam: string | null;
  readonly spotifyFollowers: number | null;
  readonly maxPlanEnabled?: boolean;
}

export interface ResolveCheckoutPlanResult {
  readonly plan: PlanIntentTier;
  readonly isDefaultUpsell: boolean;
}

/**
 * Deterministic plan-resolution rule for `/onboarding/checkout`:
 * cookie intent -> query param fallback -> organic smart recommendation
 * (respecting `maxPlanEnabled`).
 */
export function resolveCheckoutPlan(
  params: ResolveCheckoutPlanInput
): ResolveCheckoutPlanResult {
  let planIntent: PlanIntentTier | null = getPlanIntentFromCookies(
    params.cookieHeader
  );

  if (!planIntent) {
    planIntent = validatePlan(params.planParam);
  }

  const isDefaultUpsell = params.sourceParam !== 'intent';

  if (!planIntent || !isPaidIntent(planIntent)) {
    planIntent = DEFAULT_UPSELL_PLAN;
  }

  const hadPaidIntentFromCookie = isPaidIntent(
    getPlanIntentFromCookies(params.cookieHeader)
  );
  if (isDefaultUpsell && !hadPaidIntentFromCookie) {
    let recommended = recommendPlan(params.spotifyFollowers);
    if (recommended === 'max' && params.maxPlanEnabled === false) {
      recommended = DEFAULT_UPSELL_PLAN;
    }
    planIntent = recommended;
  }

  return { plan: planIntent, isDefaultUpsell };
}
