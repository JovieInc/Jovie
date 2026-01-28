import Link from 'next/link';
import type { LogoVariant } from '@/components/atoms/Logo';
import { LogoLink } from '@/components/atoms/LogoLink';
import { AuthActions } from '@/components/molecules/AuthActions';
import { Container } from '@/components/site/Container';
import { cn } from '@/lib/utils';

// Linear nav link styles - text color change only, no bg hover
const navLinkClass =
  'inline-flex items-center justify-center h-8 px-3 text-sm font-medium text-secondary-token hover:text-primary-token transition-colors duration-150 focus-ring-themed';

export interface HeaderNavProps {
  sticky?: boolean;
  className?: string;
  logoSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  logoVariant?: LogoVariant;
  hideNav?: boolean;
  hidePricingLink?: boolean;
  containerSize?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'homepage';
}

export function HeaderNav({
  sticky: _sticky = true,
  className,
  logoSize = 'sm',
  logoVariant = 'word',
  hideNav = false,
  hidePricingLink = false,
  containerSize = 'lg',
}: HeaderNavProps = {}) {
  // Note: sticky prop reserved for future use
  void _sticky;
  return (
    <header
      data-testid='header-nav'
      className={cn('sticky top-0 z-50 w-full bg-base', className)}
      style={{ fontSynthesisWeight: 'none' }}
    >
      <Container size={containerSize}>
        <div className='flex h-16 items-center'>
          {/* Logo - Left side */}
          <div className='flex items-center'>
            <LogoLink logoSize={logoSize} variant={logoVariant} />
          </div>

          {!hideNav ? (
            <>
              {/* Navigation - Center (hidden on mobile) */}
              <div className='hidden md:flex flex-1 justify-center ml-8'>
                <nav
                  className='flex items-center'
                  aria-label='Primary navigation'
                >
                  {!hidePricingLink ? (
                    <Link href='/pricing' className={navLinkClass}>
                      Pricing
                    </Link>
                  ) : null}
                </nav>
              </div>

              {/* Mobile Navigation */}
              <div className='md:hidden flex-1 justify-center flex ml-4'>
                <nav
                  className='flex items-center'
                  aria-label='Primary navigation'
                >
                  {!hidePricingLink ? (
                    <Link href='/pricing' className={navLinkClass}>
                      Pricing
                    </Link>
                  ) : null}
                </nav>
              </div>
            </>
          ) : (
            <div className='flex-1' aria-hidden='true' />
          )}

          {/* Actions - Right side */}
          <div className='flex items-center gap-2'>
            <AuthActions />
          </div>
        </div>
      </Container>
    </header>
  );
}
