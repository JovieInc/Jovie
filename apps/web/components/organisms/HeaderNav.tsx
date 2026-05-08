'use client';

import { getLinearPillClassName } from '@jovie/ui';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
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
  readonly hideDesktopNav?: boolean;
  readonly containerSize?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'homepage';
  readonly navLinks?: ReadonlyArray<{ href: string; label: string }>;
  readonly mobileNavLinks?: ReadonlyArray<{ href: string; label: string }>;
  readonly authMode?: 'client' | 'public-static';
  readonly minimalAuth?: boolean;
  readonly minimalAuthVariant?: 'link' | 'pill';
  readonly includePublicLoginInMobileNav?: boolean;
  readonly mobilePublicCtaHref?: string;
  readonly mobilePublicCtaLabel?: string;
  readonly presentation?: 'default' | 'homepage-embedded' | 'marketing-glass';
  readonly flyoutMenus?: readonly HeaderFlyoutMenu[];
  readonly showContactLink?: boolean;
}

export interface HeaderFlyoutMenu {
  readonly id: string;
  readonly label: string;
  readonly heading: string;
  readonly links: ReadonlyArray<{
    readonly href: string;
    readonly label: string;
    readonly description: string;
  }>;
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
          className='focus-ring-themed hidden h-[36px] items-center justify-center rounded-full border border-white/88 bg-white px-4 text-[13px] font-medium tracking-[-0.012em] text-black shadow-[0_8px_20px_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.72)] transition-colors duration-subtle hover:bg-white/95 sm:inline-flex sm:h-[40px] sm:px-5 sm:text-[14px] sm:shadow-[0_10px_24px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.72)]'
        >
          Sign in
        </Link>
      );
    }

    return <MarketingSignInLink variant='ghost' />;
  }
  return (
    <div className='flex items-center gap-1'>
      <Link
        href={APP_ROUTES.SIGNIN}
        className='btn-linear-login focus-ring-themed shrink-0 whitespace-nowrap'
      >
        Log in
      </Link>
      <Link
        href={APP_ROUTES.SIGNUP}
        className={getLinearPillClassName({
          className: 'focus-ring-themed shrink-0 whitespace-nowrap',
        })}
      >
        Request Access
      </Link>
    </div>
  );
}

function GlassAuthActions({
  showContactLink = true,
}: Readonly<{ showContactLink?: boolean }>) {
  return (
    <div className='hidden items-center gap-1 md:flex'>
      {showContactLink ? (
        <Link
          href={APP_ROUTES.SUPPORT}
          className='marketing-glass-header__text-link focus-ring-themed'
        >
          Contact
        </Link>
      ) : null}
      <Link
        href={APP_ROUTES.SIGNIN}
        className='marketing-glass-header__text-link focus-ring-themed'
      >
        Sign in
      </Link>
      <Link
        href={APP_ROUTES.SIGNUP}
        className='marketing-glass-header__cta focus-ring-themed'
      >
        Start Free Trial
      </Link>
    </div>
  );
}

function HeaderNavLink({
  className,
  href,
  label,
}: Readonly<{
  className: string;
  href: string;
  label: string;
}>) {
  if (href.startsWith('/') && !href.startsWith('#')) {
    return (
      <Link href={href} className={className}>
        {label}
      </Link>
    );
  }

  return (
    <a href={href} className={className}>
      {label}
    </a>
  );
}

function MarketingGlassFlyout({
  menu,
  open,
}: Readonly<{
  menu: HeaderFlyoutMenu;
  open: boolean;
}>) {
  return (
    <div
      id={`marketing-header-flyout-${menu.id}`}
      className={cn(
        'marketing-glass-header__flyout',
        open && 'marketing-glass-header__flyout--open'
      )}
      aria-hidden={!open}
      inert={!open}
    >
      <div className='marketing-glass-header__flyout-inner'>
        <p className='marketing-glass-header__flyout-heading'>{menu.heading}</p>
        <div className='marketing-glass-header__flyout-grid'>
          {menu.links.map((link, index) => (
            <Link
              href={link.href}
              key={`${menu.id}-${link.label}`}
              className='marketing-glass-header__flyout-link focus-ring-themed'
              tabIndex={open ? undefined : -1}
            >
              <span className='marketing-glass-header__flyout-number'>
                {(index + 1).toString().padStart(2, '0')}
              </span>
              <span className='min-w-0'>
                <span className='marketing-glass-header__flyout-label'>
                  {link.label}
                </span>
                <span className='marketing-glass-header__flyout-description'>
                  {link.description}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function getNavLinkVariantClass({
  isHomepagePresentation,
  isMarketingGlass,
}: Readonly<{
  isHomepagePresentation: boolean;
  isMarketingGlass: boolean;
}>) {
  if (isMarketingGlass) {
    return 'marketing-glass-header__nav-link';
  }

  if (isHomepagePresentation) {
    return 'homepage-header-nav-link';
  }

  return 'nav-link-linear';
}

function getNavGroupVariantClass({
  isHomepagePresentation,
  isMarketingGlass,
}: Readonly<{
  isHomepagePresentation: boolean;
  isMarketingGlass: boolean;
}>) {
  if (isMarketingGlass) {
    return 'marketing-glass-header__nav';
  }

  if (isHomepagePresentation) {
    return 'homepage-header-nav-group';
  }

  return 'gap-1 lg:gap-1.5';
}

function getNavContainerVariantClass({
  containerSize,
  isMarketingGlass,
}: Readonly<{
  containerSize: HeaderNavProps['containerSize'];
  isMarketingGlass: boolean;
}>) {
  if (isMarketingGlass) {
    return 'marketing-glass-header__shell';
  }

  if (containerSize === 'homepage') {
    return 'max-w-[var(--linear-content-max)] lg:px-0';
  }

  return 'max-w-[calc(var(--linear-content-max)+3rem)]';
}

export function HeaderNav({
  sticky: _sticky = true,
  className,
  style,
  logoSize = 'sm',
  logoVariant = 'word',
  hideNav = false,
  hideDesktopNav = false,
  containerSize: _containerSize = 'lg',
  navLinks,
  mobileNavLinks,
  authMode = 'client',
  minimalAuth = false,
  minimalAuthVariant = 'link',
  includePublicLoginInMobileNav = true,
  mobilePublicCtaHref,
  mobilePublicCtaLabel,
  presentation = 'default',
  flyoutMenus,
  showContactLink = true,
}: HeaderNavProps = {}) {
  const headerRef = useRef<HTMLElement | null>(null);
  const [openFlyoutId, setOpenFlyoutId] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const isMarketingGlass = presentation === 'marketing-glass';
  const isHomepagePresentation = presentation === 'homepage-embedded';
  const resolvedFlyoutMenus = isMarketingGlass ? (flyoutMenus ?? []) : [];

  useEffect(() => {
    if (!isMarketingGlass) {
      return;
    }

    const handleScroll = () => setIsScrolled(window.scrollY > 16);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => window.removeEventListener('scroll', handleScroll);
  }, [isMarketingGlass]);

  useEffect(() => {
    if (!isMarketingGlass || openFlyoutId === null) {
      return;
    }

    const closeFlyout = (restoreFocus = false) => {
      if (restoreFocus) {
        headerRef.current
          ?.querySelector<HTMLElement>(
            `[aria-controls="marketing-header-flyout-${openFlyoutId}"]`
          )
          ?.focus();
      }

      setOpenFlyoutId(null);
    };
    const closeIfOutside = (target: EventTarget | null) => {
      if (target instanceof Node && headerRef.current?.contains(target)) {
        return;
      }

      closeFlyout();
    };
    const handlePointerLeave = (event: PointerEvent) => {
      if (
        event.relatedTarget instanceof Node &&
        headerRef.current?.contains(event.relatedTarget)
      ) {
        return;
      }
      closeFlyout();
    };
    const handleFocusIn = (event: FocusEvent) => {
      closeIfOutside(event.target);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeFlyout(true);
      }
    };

    const header = headerRef.current;
    header?.addEventListener('pointerleave', handlePointerLeave);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      header?.removeEventListener('pointerleave', handlePointerLeave);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMarketingGlass, openFlyoutId]);

  const navLinkClass = cn(
    'focus-ring-themed',
    getNavLinkVariantClass({ isHomepagePresentation, isMarketingGlass })
  );
  const navGroupClass = getNavGroupVariantClass({
    isHomepagePresentation,
    isMarketingGlass,
  });
  const hasDesktopNavLinks =
    !hideNav &&
    !hideDesktopNav &&
    (!!navLinks?.length || resolvedFlyoutMenus.length > 0);
  const mobileLinks = mobileNavLinks ?? navLinks;
  const hasMobileNavLinks =
    !hideNav && !hideDesktopNav && !!mobileLinks?.length;
  const navLinksMarkup = hasDesktopNavLinks ? (
    <div className={cn('max-md:hidden items-center md:flex', navGroupClass)}>
      {isMarketingGlass
        ? resolvedFlyoutMenus.map(menu => {
            const open = openFlyoutId === menu.id;

            return (
              <div key={menu.id} className='marketing-glass-header__nav-item'>
                <button
                  type='button'
                  className={cn(
                    navLinkClass,
                    open && 'marketing-glass-header__nav-link--active'
                  )}
                  aria-expanded={open}
                  aria-controls={`marketing-header-flyout-${menu.id}`}
                  onMouseEnter={() => setOpenFlyoutId(menu.id)}
                  onFocus={() => setOpenFlyoutId(menu.id)}
                >
                  {menu.label}
                  <ChevronDown aria-hidden='true' size={13} strokeWidth={1.8} />
                </button>
                <MarketingGlassFlyout menu={menu} open={open} />
              </div>
            );
          })
        : null}
      {navLinks?.map(link => (
        <HeaderNavLink
          key={link.href}
          href={link.href}
          label={link.label}
          className={navLinkClass}
        />
      ))}
    </div>
  ) : null;
  const containerClass =
    _containerSize === 'homepage'
      ? 'flex h-[var(--linear-header-height)] w-full items-center gap-3 sm:gap-4 md:gap-6'
      : 'flex h-[var(--linear-header-height)] w-full items-center gap-6';
  return (
    <header
      ref={headerRef}
      data-testid='header-nav'
      data-presentation={presentation}
      data-scrolled={isScrolled ? 'true' : undefined}
      className={cn(
        isMarketingGlass
          ? 'marketing-glass-header fixed top-0 left-0 right-0 w-full'
          : 'fixed top-0 left-0 right-0 w-full transition-colors duration-subtle',
        presentation === 'homepage-embedded' || isMarketingGlass
          ? 'border-b border-transparent'
          : 'border-b',
        className
      )}
      style={{
        fontSynthesisWeight: 'none',
        borderColor:
          presentation === 'homepage-embedded' || isMarketingGlass
            ? 'transparent'
            : 'var(--linear-border-default)',
        backgroundColor:
          presentation === 'homepage-embedded' || isMarketingGlass
            ? 'transparent'
            : 'var(--linear-bg-header)',
        zIndex: 100,
        backdropFilter:
          presentation === 'homepage-embedded' || isMarketingGlass
            ? 'none'
            : `blur(var(--linear-blur-header))`,
        WebkitBackdropFilter:
          presentation === 'homepage-embedded' || isMarketingGlass
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
          getNavContainerVariantClass({
            containerSize: _containerSize,
            isMarketingGlass,
          })
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

          {isHomepagePresentation ? navLinksMarkup : null}

          {/* Spacer pushes nav + auth to the right */}
          <div className='flex-1' aria-hidden='true' />

          {/* Nav links - desktop only, right-aligned */}
          {isHomepagePresentation ? null : navLinksMarkup}

          {/* Divider between nav and auth - desktop only */}
          {hasDesktopNavLinks &&
          presentation !== 'homepage-embedded' &&
          !isMarketingGlass ? (
            <div
              className='mx-1.5 max-md:hidden h-4 w-px bg-(--linear-border-subtle)'
              aria-hidden='true'
            />
          ) : null}

          {/* Auth actions - visible on all sizes (Linear shows Log in + Sign up on mobile) */}
          <div
            className={cn(
              'flex items-center gap-1',
              isHomepagePresentation && 'homepage-header-auth'
            )}
          >
            {authMode === 'public-static' && isMarketingGlass ? (
              <GlassAuthActions showContactLink={showContactLink} />
            ) : authMode === 'public-static' ? (
              <PublicAuthActions
                minimal={minimalAuth}
                minimalVariant={minimalAuthVariant}
              />
            ) : (
              <AuthActions />
            )}
          </div>

          {/* Mobile hamburger menu - shown on small screens only */}
          {hasMobileNavLinks && (
            <div className='flex md:hidden items-center'>
              <MobileNav
                navLinks={mobileLinks}
                includePublicLogin={includePublicLoginInMobileNav}
                publicCtaHref={mobilePublicCtaHref}
                publicCtaLabel={mobilePublicCtaLabel}
              />
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
