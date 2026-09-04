// @coverage-via apps/web/tests/unit/marketing/support-route-header-contract.test.ts
'use client';

import { usePathname } from 'next/navigation';
import type { LogoVariant } from '@/components/atoms/Logo';
import { HeaderNav, type HeaderNavCta } from '@/components/organisms/HeaderNav';
import { APP_ROUTES } from '@/constants/routes';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { MARKETING_CTA_INTENTS } from '@/data/marketingCtaIntents';
import {
  MARKETING_NAV_LINKS,
  MARKETING_NAV_UTILITIES,
  type MarketingNavLink,
} from '@/data/marketingNavigation';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';

export type MarketingHeaderVariant = 'landing' | 'minimal' | 'homepage';
export interface MarketingHeaderNavLink extends MarketingNavLink {
  readonly treatment?: 'wordmark' | 'leading';
}
export type MarketingHeaderCta = HeaderNavCta;

const MARKETING_GLASS_DESKTOP_LINKS: readonly MarketingHeaderNavLink[] = [
  ...MARKETING_NAV_LINKS,
] as const;
const MARKETING_GLASS_MOBILE_LINKS: readonly MarketingHeaderNavLink[] = [
  { href: APP_ROUTES.HOME, label: 'Jovie' },
  ...MARKETING_NAV_LINKS,
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
      mobileNavLinks: simpleNavLinks,
      desktopNavLinks: simpleNavLinks,
    };
  }
  if (centerNavDisabled) {
    return { mobileNavLinks: [], desktopNavLinks: [] };
  }
  return {
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
      publicCta={resolvedPrimaryCta}
      mobileNavLinks={navConfig.mobileNavLinks}
      navLinks={navConfig.desktopNavLinks}
      showContactLink={false}
    />
  );
}
