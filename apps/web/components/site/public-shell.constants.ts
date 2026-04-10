import { APP_ROUTES } from '@/constants/routes';

export const PUBLIC_SHELL_FOOTER_LINKS = [
  { href: APP_ROUTES.LEGAL_PRIVACY, label: 'Privacy' },
  { href: APP_ROUTES.LEGAL_TERMS, label: 'Terms' },
  { href: APP_ROUTES.LEGAL_COOKIES, label: 'Cookies' },
] as const;

export const PUBLIC_SHELL_MAIN_OFFSET_CLASS =
  'pt-[var(--public-shell-header-offset)]';
