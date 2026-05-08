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
        label: 'Smart Release Links',
        description: 'One link for every drop.',
      },
      {
        href: APP_ROUTES.ARTIST_PROFILES,
        label: 'Artist Profiles',
        description: 'A live page that converts.',
      },
      {
        href: APP_ROUTES.LAUNCH,
        label: 'Pre-saves & Countdowns',
        description: 'Built into the same link.',
      },
      {
        href: APP_ROUTES.LAUNCH,
        label: 'Tour & City Detection',
        description: 'Show the next show first.',
      },
      {
        href: APP_ROUTES.PAY,
        label: 'Tip Jar & Instant Payout',
        description: 'Get paid in the moment.',
      },
      {
        href: `${APP_ROUTES.ARTIST_PROFILES}#capture-every-fan`,
        label: 'Fan Capture',
        description: 'Listens, scans, opt-ins.',
      },
      {
        href: APP_ROUTES.ARTIST_NOTIFICATIONS,
        label: 'Named-Fan CRM',
        description: 'Recognize who keeps showing up.',
      },
      {
        href: APP_ROUTES.ARTIST_NOTIFICATIONS,
        label: 'Direct Fan Messaging',
        description: 'Write to fans who care.',
      },
    ],
  },
  {
    id: 'resources',
    label: 'Resources',
    heading: 'Insights & solutions',
    links: [
      {
        href: APP_ROUTES.BLOG,
        label: 'Blog',
        description: 'Releases, ideas, behind the scenes.',
      },
      {
        href: APP_ROUTES.COMPARE,
        label: 'Customer Stories',
        description: 'Artists running the loop.',
      },
      {
        href: APP_ROUTES.CHANGELOG,
        label: 'Changelog',
        description: 'What shipped this week.',
      },
      {
        href: APP_ROUTES.SUPPORT,
        label: 'Help Center',
        description: 'Guides and answers.',
      },
      {
        href: APP_ROUTES.COMPARE,
        label: 'Compare',
        description: 'See how Jovie fits against general-purpose tools.',
      },
      {
        href: 'https://status.jov.ie',
        label: 'Status',
        description: 'System health.',
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
  const isHomepage = variant === 'homepage';
  const presentation = isMinimal
    ? 'default'
    : isHomepage
      ? 'homepage-embedded'
      : 'marketing-glass';
  const useCustomNav = !isMinimal && (isHomepage || navLinks !== undefined);
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
      mobilePublicCtaHref={isHomepage ? APP_ROUTES.SIGNUP : undefined}
      mobilePublicCtaLabel={isHomepage ? 'Start Free' : undefined}
      mobileNavLinks={resolvedMobileNavLinks}
      navLinks={resolvedDesktopNavLinks}
    />
  );
}
