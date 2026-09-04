import { APP_ROUTES } from '@/constants/routes';

export interface MarketingNavLink {
  readonly href: string;
  readonly label: string;
}

export interface MarketingNavFlyoutLink extends MarketingNavLink {
  readonly description: string;
}

export interface MarketingFooterLink extends MarketingNavLink {
  readonly external?: boolean;
}

export interface MarketingFooterColumn {
  readonly title: string;
  readonly links: readonly MarketingFooterLink[];
}

export const MARKETING_DEVELOPER_LINK: MarketingFooterLink = {
  href: APP_ROUTES.DEVELOPERS,
  label: 'Developers',
};

export const MARKETING_CLI_LINK: MarketingFooterLink = {
  href: APP_ROUTES.CLI,
  label: 'CLI',
};

export const MARKETING_NAV_LINKS = [
  { href: APP_ROUTES.PRODUCT, label: 'Product' },
  { href: APP_ROUTES.FOR, label: 'For' },
  { href: APP_ROUTES.TOOLS, label: 'Tools' },
  { href: APP_ROUTES.PRICING, label: 'Pricing' },
] as const satisfies readonly MarketingNavLink[];

export const MARKETING_PRODUCT_FLYOUT_LINKS = [
  {
    href: APP_ROUTES.PRODUCT_PROFILES,
    label: 'Profiles',
    description: 'One canonical identity for your work, links, and releases.',
  },
  {
    href: APP_ROUTES.PRODUCT_DISCOVERABILITY,
    label: 'Discoverability',
    description: 'Help people and search systems understand what you make.',
  },
  {
    href: APP_ROUTES.PRODUCT_AUDIENCE_INTELLIGENCE,
    label: 'Audience Intelligence',
    description: 'See the context behind attention and fan actions.',
  },
  {
    href: APP_ROUTES.PRODUCT_RELATIONSHIPS,
    label: 'Relationships',
    description: 'Turn a visit into a direct connection you can keep.',
  },
  {
    href: APP_ROUTES.HOW_IT_WORKS,
    label: 'How Jovie Works',
    description: 'Connect your identity, publish it, and learn what moves.',
  },
] as const satisfies readonly MarketingNavFlyoutLink[];

export const MARKETING_NAV_UTILITIES = [
  { href: APP_ROUTES.SIGNIN, label: 'Log in' },
  { href: APP_ROUTES.START, label: 'Get started' },
] as const satisfies readonly MarketingNavLink[];

export const MARKETING_FOR_FLYOUT_LINKS = [
  {
    href: APP_ROUTES.FOR_ARTISTS,
    label: 'Artists',
    description: 'Release pages, audience capture, and fan reactivation.',
  },
  {
    href: APP_ROUTES.FOR_FOUNDERS,
    label: 'Founders',
    description: 'A compact view of the company and operating principles.',
  },
  {
    href: APP_ROUTES.FOR_CREATORS,
    label: 'Creators',
    description: 'Turn profile traffic into durable audience ownership.',
  },
  {
    href: APP_ROUTES.FOR_AUTHORS,
    label: 'Authors',
    description: 'Editorial context for launches, profiles, and growth.',
  },
] as const satisfies readonly MarketingNavFlyoutLink[];
export const MARKETING_FOOTER_COLUMNS: readonly MarketingFooterColumn[] = [
  {
    title: 'Product',
    links: [
      { href: APP_ROUTES.PRODUCT, label: 'Overview' },
      { href: APP_ROUTES.ARTIST_PROFILES, label: 'Artist Profiles' },
      { href: APP_ROUTES.PRODUCT_DISCOVERABILITY, label: 'Discoverability' },
      {
        href: APP_ROUTES.PRODUCT_AUDIENCE_INTELLIGENCE,
        label: 'Audience Intelligence',
      },
      { href: APP_ROUTES.PRODUCT_RELATIONSHIPS, label: 'Relationships' },
      { href: APP_ROUTES.PRICING, label: 'Pricing' },
    ],
  },
  {
    title: 'For',
    links: [
      { href: APP_ROUTES.FOR_ARTISTS, label: 'Artists' },
      { href: APP_ROUTES.FOR_FOUNDERS, label: 'Founders' },
      { href: APP_ROUTES.FOR_CREATORS, label: 'Creators' },
      { href: APP_ROUTES.FOR_AUTHORS, label: 'Authors' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: APP_ROUTES.ABOUT, label: 'About' },
      { href: APP_ROUTES.BLOG, label: 'Blog' },
      { href: APP_ROUTES.CHANGELOG, label: 'Changelog' },
      { href: APP_ROUTES.INVESTORS, label: 'Investors' },
      { href: APP_ROUTES.PITCH, label: 'Pitch' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { href: APP_ROUTES.TOOLS, label: 'Tools' },
      { href: APP_ROUTES.INTEGRATIONS, label: 'Integrations' },
      { href: APP_ROUTES.HOW_IT_WORKS, label: 'How Jovie Works' },
      MARKETING_DEVELOPER_LINK,
      MARKETING_CLI_LINK,
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
