import Link from 'next/link';
import type { LogoVariant } from '@/components/atoms/Logo';
import { LogoLink } from '@/components/atoms/LogoLink';
import { AuthActions } from '@/components/molecules/AuthActions';
import { MobileNav } from '@/components/molecules/MobileNav';
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
}: HeaderNavProps = {}) {
  const navLinkClass = 'nav-link-linear focus-ring-themed';

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
        ...style,
      }}
    >
      {/* Linear-style centered content container */}
      <nav
        className='flex items-center h-16 mx-auto'
        aria-label='Primary navigation'
        style={{
          display: 'flex',
          width: '100%',
          maxWidth: 'var(--linear-container-max)',
          padding: `0 var(--linear-container-padding)`,
          margin: '0 auto',
        }}
      >
        {/* Logo section - left aligned */}
        <div className='flex items-center'>
          <LogoLink logoSize={logoSize} variant={logoVariant} />
        </div>

        {/* Center nav links - desktop only */}
        {hideNav ? (
          <div className='flex-1' aria-hidden='true' />
        ) : (
          <div className='flex-1 hidden md:flex items-center justify-center'>
            {hidePricingLink ? null : (
              <Link href='/pricing' className={navLinkClass}>
                Pricing
              </Link>
            )}
          </div>
        )}

        {/* Spacer on mobile when nav links are hidden */}
        {!hideNav && <div className='flex-1 md:hidden' aria-hidden='true' />}

        {/* Auth actions - always visible */}
        <div className='flex items-center gap-1'>
          <AuthActions />
        </div>

        {/* Mobile hamburger menu - shown on small screens only */}
        {!hideNav && (
          <div className='flex md:hidden items-center'>
            <MobileNav hidePricingLink={hidePricingLink} />
          </div>
        )}
      </nav>
    </header>
  );
}
