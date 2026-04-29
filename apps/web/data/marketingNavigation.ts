import { APP_ROUTES } from '@/constants/routes';

export interface MarketingNavLink {
  readonly href: string;
  readonly label: string;
}

export interface MarketingFooterLink extends MarketingNavLink {
  readonly external?: boolean;
}

export interface MarketingFooterColumn {
  readonly title: string;
  readonly links: readonly MarketingFooterLink[];
}

export const MARKETING_NAV_LINKS: readonly MarketingNavLink[] = [
  { href: APP_ROUTES.ARTIST_PROFILES, label: 'Product' },
  { href: APP_ROUTES.ARTIST_NOTIFICATIONS, label: 'Solutions' },
  { href: APP_ROUTES.PRICING, label: 'Pricing' },
  { href: APP_ROUTES.BLOG, label: 'Resources' },
] as const;

export const MARKETING_FOOTER_COLUMNS: readonly MarketingFooterColumn[] = [
  {
    title: 'Product',
    links: [
      { href: APP_ROUTES.ARTIST_PROFILES, label: 'Artist Profiles' },
      { href: APP_ROUTES.ARTIST_NOTIFICATIONS, label: 'Notifications' },
      { href: APP_ROUTES.PAY, label: 'Pay' },
      { href: APP_ROUTES.PRICING, label: 'Pricing' },
    ],
  },
  {
    title: 'Features',
    links: [
      {
        href: `${APP_ROUTES.ARTIST_PROFILES}#capture-every-fan`,
        label: 'Fan Capture',
      },
      {
        href: `${APP_ROUTES.ARTIST_PROFILES}#bring-them-back-automatically`,
        label: 'Fan Reactivation',
      },
      { href: APP_ROUTES.DEMO_VIDEO, label: 'Product Demo' },
      { href: APP_ROUTES.HOME, label: 'Release System' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: APP_ROUTES.ABOUT, label: 'About' },
      { href: APP_ROUTES.BLOG, label: 'Blog' },
      { href: APP_ROUTES.CHANGELOG, label: 'Changelog' },
      { href: APP_ROUTES.INVESTORS, label: 'Investors' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { href: APP_ROUTES.SUPPORT, label: 'Support' },
      { href: APP_ROUTES.COMPARE, label: 'Compare' },
      { href: APP_ROUTES.ALTERNATIVES, label: 'Alternatives' },
      { href: 'https://status.jov.ie', label: 'Status', external: true },
    ],
  },
  {
    title: 'Connect',
    links: [
      {
        href: 'https://instagram.com/meetjovie',
        label: 'Instagram',
        external: true,
      },
      { href: 'https://x.com/meetjovie', label: 'X', external: true },
      { href: APP_ROUTES.SUPPORT, label: 'Contact' },
    ],
  },
] as const;

export const MARKETING_LEGAL_LINKS: readonly MarketingFooterLink[] = [
  { href: APP_ROUTES.LEGAL_PRIVACY, label: 'Privacy' },
  { href: APP_ROUTES.LEGAL_TERMS, label: 'Terms' },
] as const;
