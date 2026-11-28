/**
 * Post-checkout return query handling for onboarding → chat (and V2).
 *
 * Stripe onboarding success/cancel appends `upgrade=success|cancel` (plus
 * `session_id` / `plan_id` on success). Surfaces that land on those URLs must
 * acknowledge the outcome and strip checkout residue from the address bar.
 */

export const ONBOARDING_CHECKOUT_RETURN_PARAMS = [
  'upgrade',
  'session_id',
  'plan_id',
] as const;

export type OnboardingCheckoutUpgradeStatus = 'success' | 'cancel';

/** Toast copy for a known upgrade return status. Unknown values → null. */
export function getOnboardingCheckoutReturnToast(
  upgradeStatus: string | null | undefined
): { tone: 'success' | 'info'; message: string } | null {
  if (upgradeStatus === 'success') {
    return { tone: 'success', message: 'Upgrade complete.' };
  }
  if (upgradeStatus === 'cancel') {
    return {
      tone: 'info',
      message: 'Checkout cancelled. You can keep going for free.',
    };
  }
  return null;
}

/** Drop Stripe return params; preserve the rest (e.g. from=onboarding, panel). */
export function stripOnboardingCheckoutReturnParams(
  search: string | URLSearchParams
): URLSearchParams {
  const params =
    typeof search === 'string'
      ? new URLSearchParams(search)
      : new URLSearchParams(search.toString());
  for (const key of ONBOARDING_CHECKOUT_RETURN_PARAMS) {
    params.delete(key);
  }
  return params;
}

export function buildOnboardingCheckoutReturnHref(
  pathname: string,
  search: string | URLSearchParams
): string {
  const nextQuery = stripOnboardingCheckoutReturnParams(search).toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}
