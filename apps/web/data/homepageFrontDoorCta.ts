import { APP_ROUTES } from '@/constants/routes';

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
        label: 'Request access',
        href: APP_ROUTES.SIGNUP,
      },
      secondary: null,
      fallbackSupport:
        'Limited prelaunch access. We will email when you are in.',
    };
  }

  return {
    primary: {
      label: 'Claim your free profile',
      href: APP_ROUTES.SIGNUP,
    },
    secondary: {
      label: 'See a live profile',
      href: APP_ROUTES.ARTIST_PROFILES,
    },
    fallbackSupport: 'Free forever. No credit card.',
  };
}
