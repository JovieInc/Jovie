import Link from 'next/link';
import type { LogoVariant } from '@/components/atoms/Logo';
import { LogoLink } from '@/components/atoms/LogoLink';
import { AuthActions } from '@/components/molecules/AuthActions';
import { cn } from '@/lib/utils';

// Linear header structure: full-width nav with flex layout
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
  // Note: sticky and containerSize props reserved for future use
  void _sticky;
  void _containerSize;

  return (
    <header
      data-testid='header-nav'
      className={cn('fixed top-0 left-0 right-0 w-full', className)}
      style={{
        fontSynthesisWeight: 'none',
        borderStyle: 'none none solid',
        borderColor:
          'rgb(247, 248, 248) rgb(247, 248, 248) rgba(255, 255, 255, 0.08)',
        zIndex: 100,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        minWidth: 0,
        minHeight: 0,
        ...style,
      }}
    >
      {/* Linear-style full-width nav with flex layout */}
      <nav
        className='flex items-center w-full h-16'
        aria-label='Primary navigation'
        style={{
          display: 'flex',
          maxWidth: 'none',
          padding: 0,
          margin: 0,
        }}
      >
        {/* Logo section - left aligned with padding */}
        <div
          className='flex items-center'
          style={{ paddingLeft: '24px', minWidth: '200px' }}
        >
          <LogoLink logoSize={logoSize} variant={logoVariant} />
        </div>

        {/* Center nav links - flex-1 to take remaining space */}
        {hideNav ? (
          <div className='flex-1' aria-hidden='true' />
        ) : (
          <div className='flex-1 flex items-center justify-center'>
            {hidePricingLink ? null : (
              <Link
                href='/pricing'
                className='nav-link-linear focus-ring-themed'
              >
                Pricing
              </Link>
            )}
          </div>
        )}

        {/* Auth actions - right aligned with padding */}
        <div
          className='flex items-center gap-1'
          style={{
            paddingRight: '24px',
            minWidth: '200px',
            justifyContent: 'flex-end',
          }}
        >
          <AuthActions />
        </div>
      </nav>
    </header>
  );
}
