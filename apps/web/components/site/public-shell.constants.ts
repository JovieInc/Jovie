import { APP_ROUTES } from '@/constants/routes';
import {
  PRIVACY_CHOICES_HREF,
  PRIVACY_CHOICES_LABEL,
} from '@/lib/cookies/consent-state';

export const PUBLIC_SHELL_FOOTER_LINKS = [
  { href: PRIVACY_CHOICES_HREF, label: PRIVACY_CHOICES_LABEL },
  { href: APP_ROUTES.LEGAL_PRIVACY, label: 'Privacy' },
  { href: APP_ROUTES.LEGAL_TERMS, label: 'Terms' },
  { href: APP_ROUTES.LEGAL_COOKIES, label: 'Cookies' },
] as const;

export const PUBLIC_SHELL_MAIN_OFFSET_CLASS =
  'pt-(--public-shell-header-offset)';

/** Lets a leading `.marketing-hero-dock` hero bleed under the docked header. */
export const PUBLIC_SHELL_MAIN_DOCKED_CLASS = 'public-shell-main--docked';
