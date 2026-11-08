/**
 * The plan a user is actually entitled to right now. A stored paid `plan`
 * without an active entitlement (`isPro` false) is Free, so no surface can
 * print a paid plan name next to a Free state.
 */
export function getEffectivePlan(
  plan: string | null | undefined,
  isPro: boolean
): string {
  return isPro && plan ? plan : 'free';
}
