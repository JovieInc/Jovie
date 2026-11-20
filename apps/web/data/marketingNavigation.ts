import { APP_ROUTES } from '@/constants/routes';
import { isNavigationEligiblePath } from '@/data/marketing/featureAvailability';
import { DEFAULT_SITE_CHROME } from '@/lib/content-records/site-chrome.defaults';
import { toResolvedSiteChrome } from '@/lib/content-records/site-chrome.resolve';

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

/**
 * Header/footer destinations consume the shared feature-availability policy
 * (JOV-6216): internal-only or unauthorized-proof routes never appear in
 * navigation even if the route exists. External links bypass the check.
 */
const eligibleLinks = <T extends { href: string; external?: boolean }>(
  links: readonly T[]
): readonly T[] =>
  links.filter(link => link.external || isNavigationEligiblePath(link.href));

export interface MarketingNavFlyoutMenu {
  readonly id: string;
  readonly label: string;
  readonly heading: string;
  readonly links: readonly MarketingNavLink[];
}

// Canonical Pen header (2026-09-26): Customers flyout, Product, Pricing.
export const MARKETING_NAV_LINKS = eligibleLinks([
  { href: APP_ROUTES.PRODUCT, label: 'Product' },
  { href: APP_ROUTES.PRICING, label: 'Pricing' },
] as const satisfies readonly MarketingNavLink[]);

/**
 * Customers flyout (Pen vWrhR). Each audience routes to its own existing
 * landing page. Audiences without one (Founders, Authors, Creators) are
 * omitted until their page ships; never substitute an unrelated page.
 * Investors is omitted too: investor pages are private (investor link or
 * admin only) and never linked from public navigation.
 */
export const MARKETING_CUSTOMERS_FLYOUT = {
  id: 'customers',
  label: 'Customers',
  heading: 'Customers',
  links: eligibleLinks([
    { href: APP_ROUTES.SOLUTIONS_ARTISTS, label: 'Artists' },
  ] as const satisfies readonly MarketingNavLink[]),
} as const satisfies MarketingNavFlyoutMenu;

export const MARKETING_NAV_UTILITIES = [
  { href: APP_ROUTES.SIGNIN, label: 'Log in' },
  { href: APP_ROUTES.START, label: 'Find yourself' },
] as const satisfies readonly MarketingNavLink[];

export const MARKETING_TOOLS_FLYOUT_LINKS = eligibleLinks([
  {
    href: APP_ROUTES.SMART_LINKS,
    label: 'Music Smart Links',
    description: 'One release link with a remembered streaming choice.',
  },
  {
    href: APP_ROUTES.ARTIST_NOTIFICATIONS,
    label: 'Audience notifications',
    description: 'Collect opt-ins once and bring listeners back automatically.',
  },
  {
    href: APP_ROUTES.INSTANT_MERCH,
    label: 'Instant Merch',
    description: 'Generate merch concepts from an artist identity.',
  },
  {
    href: APP_ROUTES.CLI,
    label: 'CLI',
    description: 'Read public artist data from the command line.',
  },
] as const satisfies readonly MarketingNavFlyoutLink[]);

/** JOV-7580. Literal so the nav label/destination invariant can read it. */
const GENERIC_SMART_LINKS_FLYOUT_LINK = {
  href: APP_ROUTES.SMART_LINKS,
  label: 'Smart Links',
  description: 'Share your work with one link. Example: a release.',
} as const satisfies MarketingNavFlyoutLink;

export function getMarketingToolsFlyoutLinks(
  genericCreatorNav = false
): readonly MarketingNavFlyoutLink[] {
  if (!genericCreatorNav) return MARKETING_TOOLS_FLYOUT_LINKS;
  return MARKETING_TOOLS_FLYOUT_LINKS.map(link =>
    link.href === APP_ROUTES.SMART_LINKS
      ? GENERIC_SMART_LINKS_FLYOUT_LINK
      : link
  );
}

/**
 * The code-default footer: projected from the site-chrome content record's
 * seed (`lib/content-records/site-chrome.ts`). The live footer is the
 * published record; this is what renders before one exists or if the store
 * is unavailable. Edit the record, not this file.
 */
export const MARKETING_FOOTER_COLUMNS: readonly MarketingFooterColumn[] =
  toResolvedSiteChrome(DEFAULT_SITE_CHROME).footerColumns.map(column => ({
    title: column.title,
    links: eligibleLinks(column.links),
  }));

/**
 * Commercial pages for the flagged site-footer refresh.
 * Every href is an existing public route. Count stays between 4 and 6.
 */
const RAW_PUBLIC_COMMERCIAL_FOOTER_LINKS = [
  { href: APP_ROUTES.PRODUCT, label: 'Product' },
  { href: APP_ROUTES.PRICING, label: 'Pricing' },
  { href: APP_ROUTES.ARTIST_PROFILES, label: 'Artist Profiles' },
  { href: APP_ROUTES.SMART_LINKS, label: 'Music Smart Links' },
] as const satisfies readonly MarketingFooterLink[];

export const PUBLIC_COMMERCIAL_FOOTER_LINKS: readonly MarketingFooterLink[] =
  eligibleLinks(RAW_PUBLIC_COMMERCIAL_FOOTER_LINKS);

export const PUBLIC_COMMERCIAL_FOOTER_COLUMN: MarketingFooterColumn = {
  title: 'Product',
  links: PUBLIC_COMMERCIAL_FOOTER_LINKS,
};

const GENERIC_SMART_LINKS_FOOTER_LINK = {
  href: APP_ROUTES.SMART_LINKS,
  label: 'Smart Links',
} as const satisfies MarketingFooterLink;

export function getPublicCommercialFooterLinks(
  genericCreatorNav = false
): readonly MarketingFooterLink[] {
  if (!genericCreatorNav) return PUBLIC_COMMERCIAL_FOOTER_LINKS;
  return PUBLIC_COMMERCIAL_FOOTER_LINKS.map(link =>
    link.href === APP_ROUTES.SMART_LINKS
      ? GENERIC_SMART_LINKS_FOOTER_LINK
      : link
  );
}

export function getPublicCommercialFooterColumn(
  genericCreatorNav = false
): MarketingFooterColumn {
  if (!genericCreatorNav) return PUBLIC_COMMERCIAL_FOOTER_COLUMN;
  return {
    title: PUBLIC_COMMERCIAL_FOOTER_COLUMN.title,
    links: getPublicCommercialFooterLinks(true),
  };
}

export const MARKETING_LEGAL_LINKS: readonly MarketingFooterLink[] = [
  { href: APP_ROUTES.LEGAL_PRIVACY, label: 'Privacy' },
  { href: APP_ROUTES.LEGAL_TERMS, label: 'Terms' },
] as const;
