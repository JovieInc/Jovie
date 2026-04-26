import { getLinearPillClassName } from '@jovie/ui';
import Link from 'next/link';
import type { LogoVariant } from '@/components/atoms/Logo';
import { LogoLink } from '@/components/atoms/LogoLink';
import { AuthActions } from '@/components/molecules/AuthActions';
import { MobileNav } from '@/components/molecules/MobileNav';
import { MarketingSignInLink } from '@/components/organisms/MarketingSignInLink';
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
  readonly containerSize?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'homepage';
  readonly navLinks?: ReadonlyArray<{ href: string; label: string }>;
  readonly authMode?: 'client' | 'public-static';
  readonly minimalAuth?: boolean;
  readonly minimalAuthVariant?: 'link' | 'pill';
  readonly includePublicLoginInMobileNav?: boolean;
  readonly presentation?: 'default' | 'homepage-embedded';
}

type PublicAuthActionsProps = Readonly<{
  readonly minimal?: boolean;
  readonly minimalVariant?: 'link' | 'pill';
}>;

function PublicAuthActions({
  minimal = false,
  minimalVariant = 'link',
}: PublicAuthActionsProps = {}) {
  if (minimal) {
    if (minimalVariant === 'pill') {
      return (
        <Link
          href={APP_ROUTES.SIGNIN}
          className='focus-ring-themed hidden h-[36px] items-center justify-center rounded-full border border-white/88 bg-white px-4 text-[13px] font-medium tracking-[-0.012em] text-black shadow-[0_8px_20px_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.72)] transition-colors duration-150 hover:bg-white/95 sm:inline-flex sm:h-[40px] sm:px-5 sm:text-[14px] sm:shadow-[0_10px_24px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.72)]'
        >
          Sign in
        </Link>
      );
    }

    return <MarketingSignInLink variant='ghost' />;
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
  minimalAuthVariant = 'link',
  includePublicLoginInMobileNav = true,
  presentation = 'default',
}: HeaderNavProps = {}) {
  const navLinkClass = cn(
    'focus-ring-themed',
    presentation === 'homepage-embedded'
      ? 'homepage-header-nav-link'
      : 'nav-link-linear'
  );
  const hasNavLinks = !hideNav && !!navLinks?.length;
  const containerClass =
    _containerSize === 'homepage'
      ? 'flex h-[var(--linear-header-height)] w-full items-center gap-3 sm:gap-4 md:gap-6'
      : 'flex h-[var(--linear-header-height)] w-full items-center gap-6';
  return (
    <header
      data-testid='header-nav'
      className={cn(
        'fixed top-0 left-0 right-0 w-full transition-colors duration-200',
        presentation === 'homepage-embedded'
          ? 'border-b border-transparent'
          : 'border-b',
        className
      )}
      style={{
        fontSynthesisWeight: 'none',
        borderColor:
          presentation === 'homepage-embedded'
            ? 'transparent'
            : 'var(--linear-border-default)',
        backgroundColor:
          presentation === 'homepage-embedded'
            ? 'transparent'
            : 'var(--linear-bg-header)',
        zIndex: 100,
        backdropFilter:
          presentation === 'homepage-embedded'
            ? 'none'
            : `blur(var(--linear-blur-header))`,
        WebkitBackdropFilter:
          presentation === 'homepage-embedded'
            ? 'none'
            : `blur(var(--linear-blur-header))`,
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
          {hasNavLinks && presentation !== 'homepage-embedded' ? (
            <div
              className='mx-1.5 max-md:hidden h-4 w-px bg-(--linear-border-subtle)'
              aria-hidden='true'
            />
          ) : null}

          {/* Auth actions - visible on all sizes (Linear shows Log in + Sign up on mobile) */}
          <div className='flex items-center gap-1'>
            {authMode === 'public-static' ? (
              <PublicAuthActions
                minimal={minimalAuth}
                minimalVariant={minimalAuthVariant}
              />
            ) : (
              <AuthActions />
            )}
          </div>

          {/* Mobile hamburger menu - shown on small screens only */}
          {hasNavLinks && (
            <div className='flex md:hidden items-center'>
              <MobileNav
                navLinks={navLinks}
                includePublicLogin={includePublicLoginInMobileNav}
              />
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
