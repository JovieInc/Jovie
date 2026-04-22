import { getLinearPillClassName } from '@jovie/ui';
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
  readonly containerSize?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'homepage';
  readonly navLinks?: ReadonlyArray<{ href: string; label: string }>;
  readonly authMode?: 'client' | 'public-static';
  readonly minimalAuth?: boolean;
}

type PublicAuthActionsProps = Readonly<{ minimal?: boolean }>;

function PublicAuthActions({ minimal = false }: PublicAuthActionsProps = {}) {
  if (minimal) {
    return (
      <Link
        href='/signin'
        className='focus-ring-themed text-[13px] text-white/60 transition-colors duration-150 hover:text-white/90'
      >
        Sign in
      </Link>
    );
  }
  return (
    <div className='flex items-center gap-1'>
      <Link href='/signin' className='btn-linear-login focus-ring-themed'>
        Log in
      </Link>
      <Link
        href='/signup'
        className={getLinearPillClassName({ className: 'focus-ring-themed' })}
      >
        Sign up
      </Link>
    </div>
  );
}

export function HeaderNav({
  sticky: _sticky = true,
  className,
  style,
  logoSize = 'sm',
  logoVariant = 'word',
  hideNav = false,
  containerSize: _containerSize = 'lg',
  navLinks,
  authMode = 'client',
  minimalAuth = false,
}: HeaderNavProps = {}) {
  const navLinkClass = 'nav-link-linear focus-ring-themed';
  const hasNavLinks = !hideNav && !!navLinks?.length;
  const containerClass =
    _containerSize === 'homepage'
      ? 'flex h-[var(--linear-header-height)] w-full items-center gap-3 sm:gap-4 md:gap-6'
      : 'flex h-[var(--linear-header-height)] w-full items-center gap-6';
  return (
    <header
      data-testid='header-nav'
      className={cn(
        'fixed top-0 left-0 right-0 w-full border-b transition-colors duration-200',
        className
      )}
      style={{
        fontSynthesisWeight: 'none',
        borderColor: 'var(--linear-border-default)',
        backgroundColor: 'var(--linear-bg-header)',
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
        className={cn(
          'mx-auto w-full px-5 sm:px-6',
          _containerSize === 'homepage'
            ? 'max-w-[var(--linear-content-max)] lg:px-0'
            : 'max-w-[calc(var(--linear-content-max)+3rem)]'
        )}
        aria-label='Primary navigation'
      >
        <div className={containerClass}>
          {/* Logo section - left aligned with Linear padding */}
          <div className='flex items-center'>
            <LogoLink
              logoSize={logoSize}
              variant={logoVariant}
              className='rounded-md'
            />
          </div>

          {/* Spacer pushes nav + auth to the right */}
          <div className='flex-1' aria-hidden='true' />

          {/* Nav links - desktop only, right-aligned */}
          {hasNavLinks && (
            <div className='max-md:hidden items-center gap-1 md:flex lg:gap-1.5'>
              {navLinks?.map(link =>
                link.href.startsWith('/') && !link.href.startsWith('#') ? (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={navLinkClass}
                  >
                    {link.label}
                  </Link>
                ) : (
                  <a key={link.href} href={link.href} className={navLinkClass}>
                    {link.label}
                  </a>
                )
              )}
            </div>
          )}

          {/* Divider between nav and auth - desktop only */}
          {hasNavLinks ? (
            <div
              className='mx-1.5 max-md:hidden h-4 w-px bg-(--linear-border-subtle)'
              aria-hidden='true'
            />
          ) : null}

          {/* Auth actions - visible on all sizes (Linear shows Log in + Sign up on mobile) */}
          <div className='flex items-center gap-1'>
            {authMode === 'public-static' ? (
              <PublicAuthActions minimal={minimalAuth} />
            ) : (
              <AuthActions />
            )}
          </div>

          {/* Mobile hamburger menu - shown on small screens only */}
          {hasNavLinks && (
            <div className='flex md:hidden items-center'>
              <MobileNav navLinks={navLinks} />
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
