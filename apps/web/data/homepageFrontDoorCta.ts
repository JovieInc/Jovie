import { APP_ROUTES } from '@/constants/routes';

export const HOMEPAGE_REQUEST_ACCESS_STARTER_PROMPT =
  'Hey, I want to get access to Jovie.';

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
        href: buildHomepageStartHref(HOMEPAGE_REQUEST_ACCESS_STARTER_PROMPT),
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
      href: APP_ROUTES.ARTIST_PROFILES,
    },
    fallbackSupport: 'Free forever. No credit card.',
  };
}
