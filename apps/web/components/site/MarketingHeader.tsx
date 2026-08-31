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
import { getHomepageFrontDoorCtaContract } from '@/data/homepageFrontDoorCta';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { MARKETING_CTA_INTENTS } from '@/data/marketingCtaIntents';
import { MARKETING_NAV_LINKS } from '@/data/marketingNavigation';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';

export type MarketingHeaderVariant = 'landing' | 'minimal' | 'homepage';
export interface MarketingHeaderNavLink {
  readonly href: string;
  readonly label: string;
  readonly treatment?: 'wordmark';
}
export type MarketingHeaderCta = HeaderNavCta;

const MARKETING_GLASS_DESKTOP_LINKS: readonly MarketingHeaderNavLink[] = [
  { href: APP_ROUTES.HOME, label: 'Jovie', treatment: 'wordmark' },
  ...MARKETING_NAV_LINKS,
] as const;
const MARKETING_GLASS_MOBILE_LINKS: readonly MarketingHeaderNavLink[] =
  MARKETING_NAV_LINKS;
const DEFAULT_MARKETING_CTA: MarketingHeaderCta =
  getHomepageFrontDoorCtaContract(FEATURE_FLAGS.WAITLIST_ENABLED).primary;
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
    return { flyoutMenus: undefined, mobileNavLinks: [], desktopNavLinks: [] };
  }
  return {
    flyoutMenus: undefined,
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
  const useCanonicalSimpleNav = isHomepage || navLinks !== undefined;
  const hasSimpleNav =
    isMinimal || (centerNavEnabled && useCanonicalSimpleNav);
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
      minimalAuth={isMinimal}
      minimalAuthVariant='link'
      minimalAuthLabel='Sign in'
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
