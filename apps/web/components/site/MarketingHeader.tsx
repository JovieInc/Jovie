'use client';

import { usePathname } from 'next/navigation';
import { HeaderNav } from '@/components/organisms/HeaderNav';
import { APP_ROUTES } from '@/constants/routes';

export type MarketingHeaderVariant = 'landing' | 'content' | 'minimal';
export interface MarketingHeaderNavLink {
  readonly href: string;
  readonly label: string;
}

const DEFAULT_STAGED_HOMEPAGE_NAV_LINKS: readonly MarketingHeaderNavLink[] = [
  { href: APP_ROUTES.ARTIST_PROFILES, label: 'Artist Profiles' },
  { href: APP_ROUTES.PRICING, label: 'Pricing' },
  { href: APP_ROUTES.SUPPORT, label: 'Support' },
] as const;
const STAGED_NAV_PATHS: readonly string[] = [
  APP_ROUTES.LANDING_NEW,
  APP_ROUTES.PRICING,
];

export interface MarketingHeaderProps
  extends Readonly<{
    readonly logoSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    readonly navLinks?: readonly MarketingHeaderNavLink[];
    readonly variant?: MarketingHeaderVariant;
  }> {}

/**
 * Marketing header with a static public auth shell.
 */
export function MarketingHeader({
  logoSize = 'xs',
  navLinks,
  variant = 'landing',
}: MarketingHeaderProps) {
  const pathname = usePathname();
  const showStagedNav =
    pathname !== null && STAGED_NAV_PATHS.includes(pathname);
  const resolvedNavLinks =
    navLinks ?? (showStagedNav ? DEFAULT_STAGED_HOMEPAGE_NAV_LINKS : undefined);

  return (
    <HeaderNav
      logoSize={logoSize}
      authMode='public-static'
      hideNav={variant === 'minimal'}
      containerSize='homepage'
      navLinks={resolvedNavLinks}
    />
  );
}
