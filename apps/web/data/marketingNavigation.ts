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
  { href: APP_ROUTES.ARTISTS, label: 'Artists' },
  { href: APP_ROUTES.PRODUCT, label: 'Product' },
  { href: APP_ROUTES.PRICING, label: 'Pricing' },
] as const satisfies readonly MarketingNavLink[];

export const MARKETING_NAV_UTILITIES = [
  { href: APP_ROUTES.SIGNIN, label: 'Log in' },
  { href: APP_ROUTES.START, label: 'Find yourself' },
] as const satisfies readonly MarketingNavLink[];

export const MARKETING_FOR_FLYOUT_LINKS = [
  {
    href: APP_ROUTES.ARTIST_PROFILES,
    label: 'Artists',
    description: 'Release pages, audience capture, and fan reactivation.',
  },
  {
    href: APP_ROUTES.PRODUCT,
    label: 'Founders',
    description: 'Show what you are building and give people a next step.',
  },
  {
    href: APP_ROUTES.ARTIST_PROFILES,
    label: 'Creators',
    description: 'Turn profile traffic into durable audience ownership.',
  },
  {
    href: APP_ROUTES.PRODUCT,
    label: 'Authors',
    description: 'A public page for the work, with a supported next step.',
  },
] as const satisfies readonly MarketingNavFlyoutLink[];

export const MARKETING_TOOLS_FLYOUT_LINKS = [
  {
    href: APP_ROUTES.SMART_LINKS,
    label: 'Music Smart Links',
    description: 'One release link with a remembered streaming choice.',
  },
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
      { href: APP_ROUTES.PRODUCT, label: 'Product' },
      { href: APP_ROUTES.CARD, label: 'Jovie Card' },
      { href: APP_ROUTES.PRICING, label: 'Pricing' },
    ],
  },
  {
    title: 'Music',
    links: [
      { href: APP_ROUTES.ARTIST_PROFILES, label: 'Artist Profiles' },
      { href: APP_ROUTES.SMART_LINKS, label: 'Music Smart Links' },
      { href: APP_ROUTES.ARTIST_NOTIFICATIONS, label: 'Notifications' },
      { href: APP_ROUTES.PAY, label: 'Pay' },
      {
        href: `${APP_ROUTES.ARTIST_PROFILES}#capture-every-fan`,
        label: 'Fan Capture',
      },
      {
        href: `${APP_ROUTES.ARTIST_PROFILES}#bring-them-back-automatically`,
        label: 'Fan Reactivation',
      },
      { href: APP_ROUTES.DEMO_VIDEO, label: 'Product Demo' },
      { href: APP_ROUTES.LAUNCH, label: 'Release System' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: APP_ROUTES.ARTISTS, label: 'Artist Directory' },
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
