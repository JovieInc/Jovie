'use client';

import { usePathname } from 'next/navigation';
import type { LogoVariant } from '@/components/atoms/Logo';
import { HeaderNav } from '@/components/organisms/HeaderNav';
import { APP_ROUTES } from '@/constants/routes';

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
    navLinks ?? (showStagedNav ? DEFAULT_STAGED_HOMEPAGE_NAV_LINKS : undefined);

  return (
    <HeaderNav
      logoSize={logoSize}
      logoVariant={logoVariant}
      authMode='public-static'
      hideNav={variant === 'minimal'}
      minimalAuth={variant === 'minimal'}
      minimalAuthVariant={variant === 'homepage' ? 'pill' : 'link'}
      includePublicLoginInMobileNav={variant !== 'homepage'}
      containerSize='homepage'
      presentation={variant === 'homepage' ? 'homepage-embedded' : 'default'}
      navLinks={resolvedNavLinks}
    />
  );
}
