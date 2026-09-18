import { APP_ROUTES } from '@/constants/routes';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

export const HOMEPAGE_REQUEST_ACCESS_STARTER_PROMPT =
  'Hey, I want to get access to Jovie.';

/**
 * Same-origin waitlist acquisition path.
 *
 * Keep this relative so Instinct/preview/dogfood CTAs stay on the current
 * host. Hardcoding https://jov.ie/waitlist sent preview "Get started" clicks
 * at production and left leftover /waitlist links looking like a dead 404.
 */
export const PUBLIC_WAITLIST_URL = APP_ROUTES.WAITLIST;

/** Append query params to a same-origin acquisition path without leaving the host. */
export function buildPublicAcquisitionHref(
  path: string,
  params?: Readonly<Record<string, string>>
): string {
  if (!params) return path;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

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
  if (waitlistEnabled) {
    return {
      primary: {
        label: 'Get started',
        href: PUBLIC_WAITLIST_URL,
      },
      secondary: null,
      fallbackSupport:
        'Limited prelaunch access. We will email when you are in.',
    };
  }

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
