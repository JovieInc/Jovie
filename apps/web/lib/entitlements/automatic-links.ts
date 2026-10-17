import 'server-only';

import { getPriceMappingDetails } from '@/lib/stripe/config';

/** Persisted billing evidence only. Never construct this from tool/API input. */
export interface AutomaticLinkBilling {
  readonly isPro?: boolean | null;
  readonly plan?: string | null;
  readonly stripePriceId?: string | null;
  readonly stripeSubscriptionId?: string | null;
}

/**
 * `isPro` is an active-billing prerequisite, never the capability grant.
 * Only the exact documented offer grants autonomous link creation. No trial,
 * founding, Max, enterprise, role or connector grant is currently documented.
 * A scheduled cancellation retains access until billing makes it effective.
 */
export function canAutomaticallyCreateLinks(
  billing: AutomaticLinkBilling
): boolean {
  if (
    billing.isPro !== true ||
    billing.plan !== 'pro' ||
    !billing.stripeSubscriptionId ||
    !billing.stripePriceId
  ) {
    return false;
  }
  const price = getPriceMappingDetails(billing.stripePriceId);
  return (
    price?.legacy !== true &&
    price?.offerCapabilities?.canAutoCreateLinks === true
  );
}
