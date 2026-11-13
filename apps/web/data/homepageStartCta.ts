import { getClaimProfileIntent } from '@/data/marketingCtaIntents';
import { isPublicSignupClosed } from '@/lib/waitlist/public-signup-gate';

/**
 * Homepage claim actions. Public signup reopened on 2026-11-09
 * (canon/PRODUCT.md) and onboarding is one flow, so the hero, the header and
 * the closing section all send a stranger into `/start` with the shared
 * claim-profile CTA intent (Tim, 2026-11-12 23:46Z: "Switch it").
 *
 * The `PUBLIC_SIGNUP_CLOSED` kill switch is the only way back: while it is on,
 * `/start` redirects to the waitlist, so the homepage keeps its own on-page
 * invitation form instead.
 *
 * Read on the server at build time (the homepage is static), so a flip of the
 * kill switch takes a redeploy.
 */
export function isHomepageStartCtaEnabled(): boolean {
  return !isPublicSignupClosed();
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
