/**
 * The one place a Stripe subscription is resolved to the plan it grants.
 * Webhooks and billing reconciliation both call it; a path that defaulted the
 * plan instead downgraded Max subscribers to Pro (2026-10-26).
 */
import { getPlanFromPriceId, type PlanType } from './config';

/** Price ids on a Stripe subscription, in item order. */
export function subscriptionPriceIds(subscription: {
  items: { data: ReadonlyArray<{ price?: { id?: string | null } | null }> };
}): string[] {
  return subscription.items.data
    .map(item => item.price?.id)
    .filter((id): id is string => Boolean(id));
}

/**
 * Resolve the plan a subscription grants. A subscription can carry more than
 * one item (an add-on next to the plan), so the first item is not necessarily
 * the plan price. The one place webhooks and reconciliation both resolve a plan.
 */
export function resolvePlanFromPriceIds(
  priceIds: readonly string[]
): { priceId: string; plan: Exclude<PlanType, 'free'> } | null {
  for (const priceId of priceIds) {
    const plan = getPlanFromPriceId(priceId);
    // A price that maps to 'free' grants nothing: treat it as unmappable.
    if (plan && plan !== 'free') return { priceId, plan };
  }
  return null;
}
