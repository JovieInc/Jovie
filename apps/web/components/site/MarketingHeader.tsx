// @coverage-via apps/web/tests/unit/marketing/support-route-header-contract.test.ts
'use client';

import { usePathname } from 'next/navigation';
import type { LogoVariant } from '@/components/atoms/Logo';
import {
  type HeaderFlyoutMenu,
  HeaderNav,
  type HeaderNavCta,
} from '@/components/organisms/HeaderNav';
import { APP_ROUTES } from '@/constants/routes';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { MARKETING_CTA_INTENTS } from '@/data/marketingCtaIntents';
import {
  MARKETING_FOR_FLYOUT_LINKS,
  MARKETING_NAV_LINKS,
  MARKETING_NAV_UTILITIES,
  MARKETING_PRODUCT_FLYOUT_LINKS,
  type MarketingNavLink,
} from '@/data/marketingNavigation';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';

export type MarketingHeaderVariant = 'landing' | 'minimal' | 'homepage';
export interface MarketingHeaderNavLink extends MarketingNavLink {
  readonly treatment?: 'wordmark' | 'leading';
}
export type MarketingHeaderCta = HeaderNavCta;

const NAV_LINK_BY_LABEL = Object.fromEntries(
  MARKETING_NAV_LINKS.map(link => [link.label, link])
) as Readonly<
  Record<(typeof MARKETING_NAV_LINKS)[number]['label'], MarketingNavLink>
>;

const MARKETING_GLASS_DESKTOP_LINKS: readonly MarketingHeaderNavLink[] = [
  { href: NAV_LINK_BY_LABEL.Tools.href, label: NAV_LINK_BY_LABEL.Tools.label },
  {
    href: NAV_LINK_BY_LABEL.Pricing.href,
    label: NAV_LINK_BY_LABEL.Pricing.label,
  },
] as const;
const MARKETING_GLASS_FLYOUTS: readonly HeaderFlyoutMenu[] = [
  {
    id: 'product',
    label: NAV_LINK_BY_LABEL.Product.label,
    heading: 'One system, many doors',
    links: MARKETING_PRODUCT_FLYOUT_LINKS,
  },
  {
    id: 'for',
    label: NAV_LINK_BY_LABEL.For.label,
    heading: 'One system for every audience',
    links: MARKETING_FOR_FLYOUT_LINKS,
  },
] as const;
const MARKETING_GLASS_MOBILE_LINKS: readonly MarketingHeaderNavLink[] = [
  { href: APP_ROUTES.HOME, label: 'Jovie' },
  {
    href: NAV_LINK_BY_LABEL.Product.href,
    label: NAV_LINK_BY_LABEL.Product.label,
  },
  ...MARKETING_GLASS_FLYOUTS.flatMap(menu =>
    menu.links.map(link => ({ href: link.href, label: link.label }))
  ),
  {
    href: NAV_LINK_BY_LABEL.Tools.href,
    label: NAV_LINK_BY_LABEL.Tools.label,
  },
  {
    href: NAV_LINK_BY_LABEL.Pricing.href,
    label: NAV_LINK_BY_LABEL.Pricing.label,
  },
] as const;
const DEFAULT_MARKETING_CTA: MarketingHeaderCta = MARKETING_NAV_UTILITIES[1];
const MARKETING_HEADER_CTA_BY_PATH: Readonly<
  Partial<Record<string, MarketingHeaderCta>>
> = {
  [APP_ROUTES.ARTIST_PROFILES]: MARKETING_CTA_INTENTS.claimProfile,
  [APP_ROUTES.ARTIST_PROFILE_LEGACY]: MARKETING_CTA_INTENTS.claimProfile,
};

export interface MarketingHeaderProps
  extends Readonly<{
    readonly logoSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    readonly logoVariant?: LogoVariant;
    readonly navLinks?: readonly MarketingHeaderNavLink[];
    readonly primaryCta?: MarketingHeaderCta;
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
    return {
      flyoutMenus: undefined,
      mobileNavLinks: [],
      desktopNavLinks: [],
    };
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
  primaryCta,
  showHomepageCenterNav = true,
  variant = 'landing',
}: MarketingHeaderProps) {
  const pathname = usePathname();
  const resolvedNavLinks = navLinks ?? MARKETING_NAV_LINKS;
  const isMinimal = variant === 'minimal';
  const isHomepage = variant === 'homepage';
  const isArtistProfiles =
    pathname === APP_ROUTES.ARTIST_PROFILES ||
    pathname === APP_ROUTES.ARTIST_PROFILE_LEGACY;
  const usesHomepageChrome = isHomepage;
  const presentation = isMinimal
    ? 'default'
    : usesHomepageChrome
      ? 'homepage-embedded'
      : 'marketing-glass';
  const centerNavEnabled =
    FEATURE_FLAGS.SHOW_MARKETING_CENTER_NAV &&
    (!usesHomepageChrome || (isHomepage && showHomepageCenterNav));
  const useCustomNav = !isMinimal && navLinks !== undefined && centerNavEnabled;
  const hasSimpleNav = isMinimal || useCustomNav;
  const centerNavDisabled = !centerNavEnabled;
  const hideCenterNav = isMinimal || centerNavDisabled;
  const navConfig = resolveNavConfig(
    hasSimpleNav,
    centerNavDisabled,
    resolvedNavLinks
  );
  const resolvedPrimaryCta =
    primaryCta ??
    (pathname === null ? undefined : MARKETING_HEADER_CTA_BY_PATH[pathname]) ??
    DEFAULT_MARKETING_CTA;
  const resolvedLogoVariant =
    presentation === 'marketing-glass'
      ? 'icon'
      : isArtistProfiles
        ? 'icon'
        : logoVariant;

  return (
    <HeaderNav
      penContractId={MARKETING_PEN_CONTRACT_IDS.shell.header}
      className={isArtistProfiles ? 'artist-profiles-home-header' : undefined}
      logoSize={isArtistProfiles ? 'sm' : logoSize}
      logoVariant={resolvedLogoVariant}
      authMode='public-static'
      hideNav={isMinimal}
      hideDesktopNav={hideCenterNav}
      minimalAuth={isMinimal || isHomepage}
      minimalAuthVariant='link'
      minimalAuthLabel={isHomepage ? 'Log in' : 'Sign in'}
      includePublicLoginInMobileNav
      containerSize='homepage'
      presentation={presentation}
      flyoutMenus={navConfig.flyoutMenus}
      publicCta={resolvedPrimaryCta}
      mobileNavLinks={navConfig.mobileNavLinks}
      navLinks={navConfig.desktopNavLinks}
      showContactLink={false}
    />
  );
}
