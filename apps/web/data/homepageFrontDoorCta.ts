import { APP_ROUTES } from '@/constants/routes';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

export const HOMEPAGE_REQUEST_ACCESS_STARTER_PROMPT =
  'Hey, I want to get access to Jovie.';

/**
 * Same-origin sign-up entry (working AuthShell) used by flows that must not
 * land on `/waitlist`, which 404s for several authenticated and
 * half-provisioned states (JOV-6436). Durable waitlist receipts stay on
 * `APP_ROUTES.WAITLIST`.
 */
export const PUBLIC_WAITLIST_URL = APP_ROUTES.SIGNUP;

/** Stable variant identity for the splash-B waitlist-first handoff. */
export const WAITLIST_FRONT_DOOR_VARIANT_ID =
  'waitlist-front-door:splash-b:v1' as const;

export const WAITLIST_FRONT_DOOR_EVENTS = {
  PAGE_VIEW: 'waitlist_front_door_viewed',
  CTA_EXPOSED: 'waitlist_front_door_cta_exposed',
} as const;

export const WAITLIST_FRONT_DOOR_CONTEXT = {
  variantIdentity: WAITLIST_FRONT_DOOR_VARIANT_ID,
  platform: 'web',
  contentVariant: 'splash-b',
} as const;

export function buildHomepageStartHref(starterPrompt?: string): string {
  if (!starterPrompt) return APP_ROUTES.START;
  const params = new URLSearchParams({ starter_prompt: starterPrompt });
  return `${APP_ROUTES.START}?${params.toString()}`;
}

export interface HomepageFrontDoorCtaContract {
  readonly primary: {
    readonly label: string;
    readonly href: string;
  };
  readonly secondary: {
    readonly label: string;
    readonly href: string;
  } | null;
  readonly fallbackSupport: string;
}

/**
 * The one public front-door CTA. Signup is open and there is one flow: every
 * claim enters the /start chat, which owns post-auth routing.
 */
export function getHomepageFrontDoorCtaContract(): HomepageFrontDoorCtaContract {
  return {
    primary: {
      label: 'Claim your free profile',
      href: buildHomepageStartHref(),
    },
    secondary: {
      label: 'See a live profile',
      href: TIM_WHITE_PROFILE.publicProfilePath,
    },
    fallbackSupport: 'Free forever. No credit card.',
  };
}
