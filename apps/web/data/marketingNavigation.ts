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

// JOV-6432: truthful interim links within the existing shared header. Publish
// Product/solution destinations through JOV-4491 before changing to that taxonomy.
// Vocabulary and migration contract: docs/marketing/LANGUAGE.md.
export const MARKETING_NAV_LINKS = [
  { href: APP_ROUTES.ABOUT, label: 'About' },
  { href: APP_ROUTES.ARTIST_PROFILES, label: 'For Artists' },
  { href: APP_ROUTES.PRICING, label: 'Pricing' },
] as const satisfies readonly MarketingNavLink[];

export const MARKETING_NAV_UTILITIES = [
  { href: APP_ROUTES.SIGNIN, label: 'Log in' },
  { href: APP_ROUTES.START, label: 'Find yourself' },
] as const satisfies readonly MarketingNavLink[];

// Future audience menus may expose only useful, publication-eligible solutions.
// About is company information; Blog is editorial. Neither is a persona page.
export const MARKETING_FOR_FLYOUT_LINKS = [
  {
    href: APP_ROUTES.ARTIST_PROFILES,
    label: 'Artists',
    description: 'Music, shows, and links on one profile.',
  },
] as const satisfies readonly MarketingNavFlyoutLink[];

export const MARKETING_TOOLS_FLYOUT_LINKS = [
  {
    href: APP_ROUTES.ARTIST_NOTIFICATIONS,
    label: 'Fan Notifications',
    description: 'Collect opt-ins once and bring fans back automatically.',
  },
  {
    href: APP_ROUTES.INSTANT_MERCH,
    label: 'Instant Merch',
    description: 'Generate merch concepts from an artist identity.',
  },
  {
    href: APP_ROUTES.YOUTUBE_THUMBNAILS,
    label: 'YouTube Thumbnails',
    description: 'Paste your channel and see three thumbnails redone, free.',
  },
  {
    href: APP_ROUTES.CLI,
    label: 'CLI',
    description: 'Read public artist data from the command line.',
  },
] as const satisfies readonly MarketingNavFlyoutLink[];

export const MARKETING_FOOTER_COLUMNS: readonly MarketingFooterColumn[] = [
  {
    title: 'Product',
    links: [
      { href: APP_ROUTES.ABOUT, label: 'Overview' },
      { href: APP_ROUTES.DOWNLOAD, label: 'Download' },
      { href: APP_ROUTES.PRICING, label: 'Pricing' },
    ],
  },
  {
    title: 'For Artists',
    links: [
      { href: APP_ROUTES.ARTIST_PROFILES, label: 'Artist Profiles' },
      { href: APP_ROUTES.ARTIST_NOTIFICATIONS, label: 'Fan Notifications' },
      { href: APP_ROUTES.PAY, label: 'Payments' },
      { href: APP_ROUTES.LAUNCH, label: 'Music Releases' },
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
      MARKETING_DEVELOPER_LINK,
      MARKETING_CLI_LINK,
      { href: APP_ROUTES.SUPPORT, label: 'Support' },
      { href: APP_ROUTES.ARTISTS, label: 'Artist Directory' },
      { href: APP_ROUTES.DEMO_VIDEO, label: 'Music Demo' },
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
