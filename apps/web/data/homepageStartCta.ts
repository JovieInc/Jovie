import { getClaimProfileIntent } from '@/data/marketingCtaIntents';
import { isCodeFlagEnabled } from '@/lib/flags/code-flags';
import { isPublicSignupClosed } from '@/lib/waitlist/public-signup-gate';

/**
 * Homepage hero primary action. Public signup reopened on 2026-11-09
 * (canon/PRODUCT.md) and onboarding is one flow, so a stranger should be able
 * to start it from the hero.
 *
 * `HOMEPAGE_START_CTA` (default off) swaps the hero action for the shared
 * claim-profile CTA intent, which enters `/start`. Off, or while the
 * `PUBLIC_SIGNUP_CLOSED` kill switch sends `/start` back to the waitlist, the
 * hero keeps its own action: scroll to the on-page invitation form.
 *
 * Read on the server at build time (the homepage is static), so a flip takes
 * a redeploy.
 */
export function isHomepageStartCtaEnabled(): boolean {
  return isCodeFlagEnabled('HOMEPAGE_START_CTA') && !isPublicSignupClosed();
}

export interface HomepageHeroPrimaryAction {
  readonly label: string;
  readonly href: string;
  /** The note under the actions describes the invitation form only. */
  readonly showInviteNote: boolean;
}

export function resolveHomepageHeroPrimaryAction(
  copy: Readonly<{ primaryAction: string; primaryHref: string }>
): HomepageHeroPrimaryAction {
  if (!isHomepageStartCtaEnabled()) {
    return {
      label: copy.primaryAction,
      href: copy.primaryHref,
      showInviteNote: true,
    };
  }
  const intent = getClaimProfileIntent();
  return { label: intent.label, href: intent.href, showInviteNote: false };
}
