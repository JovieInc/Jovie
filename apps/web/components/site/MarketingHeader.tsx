'use client';

import { usePathname } from 'next/navigation';
import type { LogoVariant } from '@/components/atoms/Logo';
import {
  type HeaderFlyoutMenu,
  HeaderNav,
} from '@/components/organisms/HeaderNav';
import { APP_ROUTES } from '@/constants/routes';
import { MARKETING_NAV_LINKS } from '@/data/marketingNavigation';

export type MarketingHeaderVariant =
  | 'landing'
  | 'content'
  | 'minimal'
  | 'homepage';
export interface MarketingHeaderNavLink {
  readonly href: string;
  readonly label: string;
}

const DEFAULT_STAGED_HOMEPAGE_NAV_LINKS: readonly MarketingHeaderNavLink[] = [
  { href: APP_ROUTES.ARTIST_PROFILES, label: 'Artist Profiles' },
  { href: APP_ROUTES.PRICING, label: 'Pricing' },
  { href: APP_ROUTES.SUPPORT, label: 'Support' },
] as const;
const STAGED_NAV_PATHS = new Set<string>([
  APP_ROUTES.LANDING_NEW,
  APP_ROUTES.PRICING,
]);
const MARKETING_GLASS_DESKTOP_LINKS: readonly MarketingHeaderNavLink[] = [
  { href: APP_ROUTES.PRICING, label: 'Pricing' },
] as const;
const MARKETING_GLASS_FLYOUTS: readonly HeaderFlyoutMenu[] = [
  {
    id: 'features',
    label: 'Features',
    heading: 'Product',
    links: [
      {
        href: APP_ROUTES.ARTIST_PROFILES,
        label: 'Artist Profiles',
        description: 'A live page that routes fans to the right action.',
      },
      {
        href: APP_ROUTES.ARTIST_NOTIFICATIONS,
        label: 'Fan Capture',
        description:
          'Collect demand from releases, shows, links, and QR scans.',
      },
      {
        href: APP_ROUTES.LAUNCH,
        label: 'Release System',
        description: 'Plan, launch, and keep each release moving.',
      },
      {
        href: APP_ROUTES.PAY,
        label: 'Pay',
        description: 'Tips and support moments inside the same experience.',
      },
    ],
  },
  {
    id: 'resources',
    label: 'Resources',
    heading: 'Insights',
    links: [
      {
        href: APP_ROUTES.BLOG,
        label: 'Blog',
        description: 'Release ideas and product thinking for artists.',
      },
      {
        href: APP_ROUTES.CHANGELOG,
        label: 'Changelog',
        description: 'What shipped for artists and teams.',
      },
      {
        href: APP_ROUTES.SUPPORT,
        label: 'Support',
        description: 'Guides, answers, and contact paths.',
      },
      {
        href: APP_ROUTES.COMPARE,
        label: 'Compare',
        description: 'See how Jovie fits against general-purpose tools.',
      },
    ],
  },
] as const;
const MARKETING_GLASS_MOBILE_LINKS: readonly MarketingHeaderNavLink[] = [
  ...MARKETING_GLASS_FLYOUTS.flatMap(menu =>
    menu.links.map(link => ({ href: link.href, label: link.label }))
  ),
  ...MARKETING_GLASS_DESKTOP_LINKS,
] as const;

export interface MarketingHeaderProps
  extends Readonly<{
    readonly logoSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    readonly logoVariant?: LogoVariant;
    readonly navLinks?: readonly MarketingHeaderNavLink[];
    readonly variant?: MarketingHeaderVariant;
  }> {}

/**
 * Marketing header with a static public auth shell.
 */
export function MarketingHeader({
  logoSize = 'xs',
  logoVariant = 'word',
  navLinks,
  variant = 'landing',
}: MarketingHeaderProps) {
  const pathname = usePathname();
  const showStagedNav = pathname !== null && STAGED_NAV_PATHS.has(pathname);
  const resolvedNavLinks =
    navLinks ??
    (showStagedNav ? DEFAULT_STAGED_HOMEPAGE_NAV_LINKS : MARKETING_NAV_LINKS);
  const isMinimal = variant === 'minimal';
  const presentation = isMinimal ? 'default' : 'marketing-glass';
  const useCustomNav = !isMinimal && navLinks !== undefined;
  const hasSimpleNav = isMinimal || useCustomNav;
  const resolvedFlyoutMenus = hasSimpleNav
    ? undefined
    : MARKETING_GLASS_FLYOUTS;
  const resolvedMobileNavLinks = hasSimpleNav
    ? resolvedNavLinks
    : MARKETING_GLASS_MOBILE_LINKS;
  const resolvedDesktopNavLinks = hasSimpleNav
    ? resolvedNavLinks
    : MARKETING_GLASS_DESKTOP_LINKS;

  return (
    <HeaderNav
      logoSize={logoSize}
      logoVariant={logoVariant}
      authMode='public-static'
      hideNav={isMinimal}
      minimalAuth={isMinimal}
      minimalAuthVariant='link'
      includePublicLoginInMobileNav
      containerSize='homepage'
      presentation={presentation}
      flyoutMenus={resolvedFlyoutMenus}
      mobileNavLinks={resolvedMobileNavLinks}
      navLinks={resolvedDesktopNavLinks}
    />
  );
}
