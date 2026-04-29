'use client';

import type { LogoVariant } from '@/components/atoms/Logo';
import { HeaderNav } from '@/components/organisms/HeaderNav';
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
  const resolvedNavLinks = navLinks ?? MARKETING_NAV_LINKS;
  const isHomepageVariant = variant === 'homepage';

  return (
    <HeaderNav
      logoSize={logoSize}
      logoVariant={logoVariant}
      authMode='public-static'
      hideNav={variant === 'minimal'}
      minimalAuth={variant === 'minimal' || isHomepageVariant}
      minimalAuthVariant={isHomepageVariant ? 'pill' : 'link'}
      includePublicLoginInMobileNav={!isHomepageVariant}
      containerSize='homepage'
      presentation={isHomepageVariant ? 'homepage-embedded' : 'public-compact'}
      navLinks={resolvedNavLinks}
    />
  );
}
