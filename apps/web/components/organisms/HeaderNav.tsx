import Link from 'next/link';
import type { LogoVariant } from '@/components/atoms/Logo';
import { LogoLink } from '@/components/atoms/LogoLink';
import { AuthActions } from '@/components/molecules/AuthActions';
import { Container } from '@/components/site/Container';
import { cn } from '@/lib/utils';

// Linear nav link styles - exact specs from comparison
const navLinkClass =
  'inline-flex items-center justify-start h-8 px-2 -ml-2 text-[16px] font-normal text-[rgb(247,248,248)] hover:text-white transition-colors duration-150 rounded-[6px] focus-ring-themed';

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
  containerSize = 'lg',
}: HeaderNavProps = {}) {
  // Note: sticky prop reserved for future use
  void _sticky;
  return (
    <header
      data-testid='header-nav'
      className={cn('sticky top-0 z-50 w-full', className)}
      style={{
        fontSynthesisWeight: 'none',
        borderStyle: 'none none solid',
        borderColor:
          'rgb(247, 248, 248) rgb(247, 248, 248) rgba(255, 255, 255, 0.08)',
        ...style,
      }}
    >
      <Container size={containerSize}>
        <div className='flex h-16 items-center'>
          {/* Logo - Left side */}
          <div className='flex items-center'>
            <LogoLink logoSize={logoSize} variant={logoVariant} />
          </div>

          {hideNav ? (
            <div className='flex-1' aria-hidden='true' />
          ) : (
            <>
              {/* Navigation - Center (hidden on mobile) */}
              <div className='hidden md:flex flex-1 justify-center ml-8'>
                <nav
                  className='flex items-center'
                  aria-label='Primary navigation'
                  style={{
                    borderStyle: 'none',
                    borderColor: 'rgb(247, 248, 248)',
                  }}
                >
                  {hidePricingLink ? null : (
                    <Link
                      href='/pricing'
                      className={navLinkClass}
                      style={{
                        borderStyle: 'none',
                        borderColor: 'rgb(247, 248, 248)',
                      }}
                    >
                      Pricing
                    </Link>
                  )}
                </nav>
              </div>

              {/* Mobile Navigation */}
              <div className='md:hidden flex-1 justify-center flex ml-4'>
                <nav
                  className='flex items-center'
                  aria-label='Primary navigation'
                  style={{
                    borderStyle: 'none',
                    borderColor: 'rgb(247, 248, 248)',
                  }}
                >
                  {hidePricingLink ? null : (
                    <Link
                      href='/pricing'
                      className={navLinkClass}
                      style={{
                        borderStyle: 'none',
                        borderColor: 'rgb(247, 248, 248)',
                      }}
                    >
                      Pricing
                    </Link>
                  )}
                </nav>
              </div>
            </>
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
