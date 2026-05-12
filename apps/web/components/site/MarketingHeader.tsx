'use client';

import { usePathname } from 'next/navigation';
import type { LogoVariant } from '@/components/atoms/Logo';
import {
  type HeaderFlyoutMenu,
  HeaderNav,
} from '@/components/organisms/HeaderNav';
import { APP_ROUTES } from '@/constants/routes';
import { MARKETING_NAV_LINKS } from '@/data/marketingNavigation';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';

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
    heading: 'Release system',
    links: [
      {
        href: APP_ROUTES.ARTIST_PROFILES,
        label: 'Smart Release Links',
        description: 'One fan path for every drop.',
      },
      {
        href: APP_ROUTES.LAUNCH,
        label: 'Pre-saves & Countdowns',
        description: 'Before and after release day.',
      },
      {
        href: APP_ROUTES.ARTIST_PROFILES,
        label: 'Artist Profiles',
        description: 'Built to convert, not decorate.',
      },
      {
        href: `${APP_ROUTES.ARTIST_PROFILES}#capture-every-fan`,
        label: 'Capture Every Fan',
        description: 'Turn traffic into an audience.',
      },
      {
        href: APP_ROUTES.ARTIST_NOTIFICATIONS,
        label: 'Automatic Fan Notifications',
        description: 'Fans opt in once and come back.',
      },
      {
        href: APP_ROUTES.LAUNCH,
        label: 'Tour City Routing',
        description: 'Show the right city first.',
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
        label: 'Compare',
        description: 'See where Jovie fits.',
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
    readonly showHomepageCenterNav?: boolean;
    readonly variant?: MarketingHeaderVariant;
  }> {}

interface ResolvedNavConfig {
  readonly flyoutMenus: readonly HeaderFlyoutMenu[] | undefined;
  readonly mobileNavLinks: readonly MarketingHeaderNavLink[];
  readonly desktopNavLinks: readonly MarketingHeaderNavLink[];
}

function resolveNavConfig(
  hasSimpleNav: boolean,
  centerNavDisabled: boolean,
  simpleNavLinks: readonly MarketingHeaderNavLink[]
): ResolvedNavConfig {
  if (hasSimpleNav) {
    return {
      flyoutMenus: undefined,
      mobileNavLinks: simpleNavLinks,
      desktopNavLinks: simpleNavLinks,
    };
  }
  if (centerNavDisabled) {
    return { flyoutMenus: undefined, mobileNavLinks: [], desktopNavLinks: [] };
  }
  return {
    flyoutMenus: MARKETING_GLASS_FLYOUTS,
    mobileNavLinks: MARKETING_GLASS_MOBILE_LINKS,
    desktopNavLinks: MARKETING_GLASS_DESKTOP_LINKS,
  };
}

export function MarketingHeader({
  logoSize = 'xs',
  logoVariant = 'word',
  navLinks,
  showHomepageCenterNav = true,
  variant = 'landing',
}: MarketingHeaderProps) {
  const pathname = usePathname();
  const showStagedNav = pathname !== null && STAGED_NAV_PATHS.has(pathname);
  const resolvedNavLinks =
    navLinks ??
    (showStagedNav ? DEFAULT_STAGED_HOMEPAGE_NAV_LINKS : MARKETING_NAV_LINKS);
  const isMinimal = variant === 'minimal';
  const isHomepage = variant === 'homepage';
  const presentation = isMinimal ? 'default' : 'marketing-glass';
  const useCustomNav = !isMinimal && navLinks !== undefined;
  const hasSimpleNav = isMinimal || useCustomNav;
  const centerNavDisabled =
    !useCustomNav &&
    (!FEATURE_FLAGS.SHOW_MARKETING_CENTER_NAV ||
      (isHomepage && !showHomepageCenterNav));
  const hideCenterNav = isMinimal || centerNavDisabled;
  const navConfig = resolveNavConfig(
    hasSimpleNav,
    centerNavDisabled,
    resolvedNavLinks
  );

  return (
    <HeaderNav
      logoSize={logoSize}
      logoVariant={logoVariant}
      authMode='public-static'
      hideNav={isMinimal}
      hideDesktopNav={hideCenterNav}
      minimalAuth={isMinimal}
      minimalAuthVariant='link'
      includePublicLoginInMobileNav
      containerSize='homepage'
      presentation={presentation}
      flyoutMenus={navConfig.flyoutMenus}
      mobilePublicCtaHref={isHomepage ? APP_ROUTES.SIGNUP : undefined}
      mobilePublicCtaLabel={isHomepage ? 'Start Free Trial' : undefined}
      mobileNavLinks={navConfig.mobileNavLinks}
      navLinks={navConfig.desktopNavLinks}
      showContactLink={!isHomepage}
    />
  );
}
