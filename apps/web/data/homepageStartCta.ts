import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { HOME_MARKETING_HEADER_CTA } from '@/data/marketing/headerCta';
import { getClaimProfileIntent } from '@/data/marketingCtaIntents';
import { isCodeFlagEnabled } from '@/lib/flags/code-flags';
import { isPublicSignupClosed } from '@/lib/waitlist/public-signup-gate';

/**
 * Homepage start CTA. Public signup reopened on 2026-11-09
 * (canon/PRODUCT.md) and onboarding is one flow, so a stranger should be able
 * to start it from the homepage.
 *
 * `HOMEPAGE_START_CTA` (default off) swaps every invitation entry point on the
 * page (hero action, header action, closing section) for the shared
 * claim-profile CTA intent, which enters `/start`. Off, or while the
 * `PUBLIC_SIGNUP_CLOSED` kill switch sends `/start` back to the waitlist, the
 * page keeps its invite-only story: each action scrolls to the on-page form.
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
  copy: Readonly<{ primaryAction: string; primaryHref: string }>,
  enabled: boolean = isHomepageStartCtaEnabled()
): HomepageHeroPrimaryAction {
  if (!enabled) {
    return {
      label: copy.primaryAction,
      href: copy.primaryHref,
      showInviteNote: true,
    };
  }
  const intent = getClaimProfileIntent();
  return { label: intent.label, href: intent.href, showInviteNote: false };
}

/** Header action (the mobile menu shows it): the same intent as the hero. */
export function resolveHomepageHeaderCta(
  enabled: boolean = isHomepageStartCtaEnabled()
): Readonly<{ label: string; href: string }> {
  if (!enabled) return HOME_MARKETING_HEADER_CTA;
  const intent = getClaimProfileIntent();
  return { label: intent.label, href: intent.href };
}

export interface HomepageClaimClose {
  readonly headline: string;
  readonly subhead: string;
  readonly label: string;
  readonly href: string;
  readonly eventName: string;
  /** Chapter index and rule label, in place of "invitation". */
  readonly chapter: string;
  /** Section id, in place of the invitation form's anchor. */
  readonly anchor: string;
}

/**
 * Closing section with the flag on, or null to keep the invitation form. No
 * new marketing copy: the headline and subhead are the approved closing of the
 * artist-profile page (`ARTIST_PROFILE_COPY.finalCta`, JOV-8565), and the
 * action is the shared claim-profile intent.
 */
export function resolveHomepageClaimClose(
  enabled: boolean = isHomepageStartCtaEnabled()
): HomepageClaimClose | null {
  if (!enabled) return null;
  const intent = getClaimProfileIntent();
  return {
    headline: ARTIST_PROFILE_COPY.finalCta.headline,
    subhead: ARTIST_PROFILE_COPY.finalCta.subhead,
    label: intent.label,
    href: intent.href,
    eventName: intent.eventName,
    chapter: 'claim',
    anchor: 'claim-profile',
  };
}
