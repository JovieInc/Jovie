/**
 * Founder-facing names and headline for a revenue blocker. Split from
 * story-first.ts to keep that file under the size-500 ratchet.
 */

import type { CompanyBlocker } from './company-blocker';

const STEP_EYEBROW: Readonly<Record<string, string>> = {
  public_profile: 'Profile',
  homepage_entry: 'Homepage',
  onboarding_auth_claim: 'Claim',
  checkout_payment_entitlement: 'Checkout',
  activation_dashboard: 'Activation',
};

export function stepLabel(step: string): string {
  const labeled = STEP_EYEBROW[step];
  if (labeled) return labeled;
  return step
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Never assert a block the evidence doesn't prove (Tim, 2026-11-22). */
export const UNPROVEN_BOTTLENECK_TITLE = "We can't see the bottleneck yet";

export function shortTitle(blocker: CompanyBlocker): string {
  // A failed check and a measured drop support different claims.
  if (blocker.tone !== 'bad') return UNPROVEN_BOTTLENECK_TITLE;
  if (blocker.kind === 'certification') {
    const name =
      blocker.step === 'public_profile'
        ? 'Public profile'
        : blocker.step === 'homepage_entry'
          ? 'Homepage entry'
          : blocker.step === 'onboarding_auth_claim'
            ? 'Sign-up and claim'
            : blocker.step === 'activation_dashboard'
              ? 'First use after paying'
              : stepLabel(blocker.step);
    return `${name} certification needs attention`;
  }
  // Funnel body already carries the measured detail — headline must differ.
  return `${stepLabel(blocker.step)} is blocking revenue`;
}
