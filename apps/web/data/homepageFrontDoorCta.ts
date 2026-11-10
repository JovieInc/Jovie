import { APP_ROUTES } from '@/constants/routes';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

export const HOMEPAGE_REQUEST_ACCESS_STARTER_PROMPT =
  'Hey, I want to get access to Jovie.';

/**
 * Canonical public acquisition destination for marketing CTAs. Every door
 * routes into `/start` (the chat onboarding), which admits or reserves
 * server-side; nothing lands on `/signup` or `/waitlist` from marketing
 * surfaces. Durable waitlist receipts stay on `APP_ROUTES.WAITLIST`.
 */
export const PUBLIC_WAITLIST_URL = APP_ROUTES.START;

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

export function getHomepageFrontDoorCtaContract(
  waitlistEnabled: boolean
): HomepageFrontDoorCtaContract {
  // One front door (Tim, 2026-11-09): both modes resolve the same claim
  // CTA into /start; the server-side gate decides admit vs reserve. The
  // secondary stays the quiet live-profile proof path in both modes.
  void waitlistEnabled;
  return {
    primary: {
      label: 'Claim your handle',
      href: buildHomepageStartHref(),
    },
    secondary: {
      label: 'See a live profile',
      href: TIM_WHITE_PROFILE.publicProfilePath,
    },
    fallbackSupport: 'Free to start. Reserve your name now.',
  };
}
