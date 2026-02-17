'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LogoVariant } from '@/components/atoms/Logo';
import { LogoLink } from '@/components/atoms/LogoLink';
import { AuthActions } from '@/components/molecules/AuthActions';
import { MobileNav } from '@/components/molecules/MobileNav';
import { APP_ROUTES } from '@/constants/routes';
import { cn } from '@/lib/utils';

// Linear header structure: full-width header with centered ~1000px content
// Linear uses ~224px margins on 1440px viewport = ~984px content width
// maxWidth 1032px - 48px (24px padding each side) = 984px content
// See globals.css for .nav-link-linear styles

export interface HeaderNavProps {
  readonly sticky?: boolean;
  readonly className?: string;
  readonly style?: React.CSSProperties;
  readonly logoSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  readonly logoVariant?: LogoVariant;
  readonly hideNav?: boolean;
  readonly hidePricingLink?: boolean;
  readonly containerSize?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'homepage';
  readonly navLinks?: ReadonlyArray<{ href: string; label: string }>;
}

export function HeaderNav({
  sticky: _sticky = true,
  className,
  style,
  logoSize = 'sm',
  logoVariant = 'word',
  hideNav = false,
  hidePricingLink = false,
  containerSize: _containerSize = 'lg',
  navLinks,
}: HeaderNavProps = {}) {
  const pathname = usePathname();
  const navLinkClass = 'nav-link-linear focus-ring-themed';
  const isPricingActive = pathname === APP_ROUTES.PRICING;

  return (
    <header
      data-testid='header-nav'
      className={cn('fixed top-0 left-0 right-0 w-full', className)}
      style={{
        fontSynthesisWeight: 'none',
        borderStyle: 'none none solid',
        borderColor: `var(--linear-text-primary) var(--linear-text-primary) var(--linear-border-subtle)`,
        zIndex: 100,
        backdropFilter: `blur(var(--linear-blur-header))`,
        WebkitBackdropFilter: `blur(var(--linear-blur-header))`,
        minWidth: 0,
        minHeight: 0,
        /* iOS safe area: push header content below the notch/Dynamic Island */
        paddingTop: 'env(safe-area-inset-top)',
        ...style,
      }}
    >
      {/* Linear-style full-width content container */}
      <nav
        className='flex items-center h-[72px] w-full px-5 sm:px-6 lg:px-[77px]'
        aria-label='Primary navigation'
      >
        {/* Logo section - left aligned with Linear padding */}
        <div className='flex items-center'>
          <LogoLink
            logoSize={logoSize}
            variant={logoVariant}
            className='px-2 rounded-[6px]'
          />
        </div>

        {/* Spacer pushes nav + auth to the right */}
        <div className='flex-1' aria-hidden='true' />

        {/* Nav links - desktop only, right-aligned */}
        {!hideNav && (
          <div className='hidden md:flex items-center gap-2'>
            {navLinks
              ? navLinks.map(link => (
                  <a key={link.href} href={link.href} className={navLinkClass}>
                    {link.label}
                  </a>
                ))
              : !hidePricingLink && (
                  <Link
                    href={APP_ROUTES.PRICING}
                    className={cn(navLinkClass, isPricingActive && 'is-active')}
                    aria-current={isPricingActive ? 'page' : undefined}
                  >
                    Pricing
                  </Link>
                )}
          </div>
        )}

        {/* Divider between nav and auth - desktop only */}
        <div
          className='hidden md:block mx-3 h-4 w-px'
          style={{ backgroundColor: 'rgb(35, 37, 42)' }}
          aria-hidden='true'
        />

        {/* Auth actions - visible on all sizes (Linear shows Log in + Sign up on mobile) */}
        <div className='flex items-center gap-1'>
          <AuthActions />
        </div>

        {/* Mobile hamburger menu - shown on small screens only */}
        {!hideNav && (
          <div className='flex md:hidden items-center'>
            <MobileNav hidePricingLink={hidePricingLink} navLinks={navLinks} />
          </div>
        )}
      </nav>
    </header>
  );
}
