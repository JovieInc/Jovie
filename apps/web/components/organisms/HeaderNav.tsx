// @coverage-via apps/web/tests/unit/HeaderNavFlyout.test.tsx
'use client';

import './HeaderNav.css';
import { Button, getLinearPillClassName } from '@jovie/ui';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LogoVariant } from '@/components/atoms/Logo';
import { LogoLink } from '@/components/atoms/LogoLink';
import { AuthActions } from '@/components/molecules/AuthActions';
import { MobileNav } from '@/components/molecules/MobileNav';
import { MarketingSignInLink } from '@/components/organisms/MarketingSignInLink';
import { UserButton } from '@/components/organisms/user-button';
import { APP_ROUTES } from '@/constants/routes';
import type { MarketingPenContractId } from '@/data/marketing/penContracts';
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
  readonly navLinks?: ReadonlyArray<HeaderNavLinkItem>;
  readonly mobileNavLinks?: ReadonlyArray<{ href: string; label: string }>;
  readonly authMode?: 'client' | 'public-static';
  readonly minimalAuth?: boolean;
  readonly minimalAuthVariant?: 'link' | 'pill';
  readonly includePublicLoginInMobileNav?: boolean;
  readonly publicCta?: HeaderNavCta;
  readonly presentation?: 'default' | 'homepage-embedded' | 'marketing-glass';
  readonly flyoutMenus?: readonly HeaderFlyoutMenu[];
  readonly showContactLink?: boolean;
  readonly penContractId?: MarketingPenContractId;
}

export interface HeaderNavCta {
  readonly href: string;
  readonly label: string;
}

export interface HeaderNavLinkItem {
  readonly href: string;
  readonly label: string;
  readonly treatment?: 'wordmark';
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
  readonly publicCta?: HeaderNavCta;
}>;

function PublicAuthActions({
  minimal = false,
  minimalVariant = 'link',
  publicCta = {
    href: APP_ROUTES.SIGNUP,
    label: 'Request Access',
  },
}: PublicAuthActionsProps = {}) {
  if (minimal) {
    if (minimalVariant === 'pill') {
      return (
        <Button
          asChild
          variant='whitePill'
          className='focus-ring-themed hidden h-9 px-4 text-app sm:inline-flex sm:h-10 sm:px-5 sm:text-sm'
        >
          <Link href={APP_ROUTES.SIGNIN}>Sign in</Link>
        </Button>
      );
    }

    return <MarketingSignInLink variant='ghost' />;
  }
  return (
    <div className='flex items-center gap-2'>
      <Link
        href={APP_ROUTES.SIGNIN}
        className='btn-linear-login focus-ring-themed shrink-0 whitespace-nowrap'
      >
        Log in
      </Link>
      <Link
        href={publicCta.href}
        className={getLinearPillClassName({
          className: 'focus-ring-themed shrink-0 whitespace-nowrap',
        })}
      >
        {publicCta.label}
      </Link>
    </div>
  );
}

function GlassAuthActions({
  publicCta = {
    href: APP_ROUTES.SIGNUP,
    label: 'Request Access',
  },
  showContactLink = true,
}: Readonly<{
  publicCta?: HeaderNavCta;
  showContactLink?: boolean;
}>) {
  return (
    <div className='flex items-center gap-1'>
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
        Log in
      </Link>
      <Link
        href={publicCta.href}
        className='marketing-glass-header__cta focus-ring-themed'
      >
        {publicCta.label}
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
  const [animateOpen, setAnimateOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setAnimateOpen(false);
      return;
    }

    const frame = requestAnimationFrame(() => setAnimateOpen(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      id={`marketing-header-flyout-${menu.id}`}
      className={cn(
        'marketing-glass-header__flyout',
        animateOpen && 'marketing-glass-header__flyout--open'
      )}
    >
      <div className='marketing-glass-header__flyout-inner'>
        <p className='marketing-glass-header__flyout-heading'>{menu.heading}</p>
        <div className='marketing-glass-header__flyout-grid'>
          {menu.links.map((link, index) => (
            <Link
              href={link.href}
              key={`${menu.id}-${link.label}`}
              className='marketing-glass-header__flyout-link focus-ring-themed'
            >
              <span
                className='marketing-glass-header__flyout-number'
                aria-hidden='true'
              >
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
    return 'max-w-linear-content lg:px-0';
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
  publicCta,
  presentation = 'default',
  flyoutMenus,
  showContactLink = true,
  penContractId,
}: HeaderNavProps = {}) {
  const headerRef = useRef<HTMLElement | null>(null);
  const closeFlyoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const [openFlyoutId, setOpenFlyoutId] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const isMarketingGlass = presentation === 'marketing-glass';
  const isHomepagePresentation = presentation === 'homepage-embedded';
  const resolvedFlyoutMenus = isMarketingGlass ? (flyoutMenus ?? []) : [];

  const clearFlyoutCloseTimer = useCallback(() => {
    if (closeFlyoutTimerRef.current === null) {
      return;
    }

    clearTimeout(closeFlyoutTimerRef.current);
    closeFlyoutTimerRef.current = null;
  }, []);

  const openFlyout = useCallback(
    (menuId: string) => {
      clearFlyoutCloseTimer();
      setOpenFlyoutId(menuId);
    },
    [clearFlyoutCloseTimer]
  );

  const closeFlyout = useCallback(
    (restoreFocus = false) => {
      clearFlyoutCloseTimer();

      if (restoreFocus && openFlyoutId !== null) {
        headerRef.current
          ?.querySelector<HTMLElement>(
            `[aria-controls="marketing-header-flyout-${openFlyoutId}"]`
          )
          ?.focus();
      }

      setOpenFlyoutId(null);
    },
    [clearFlyoutCloseTimer, openFlyoutId]
  );

  const scheduleFlyoutClose = useCallback(() => {
    clearFlyoutCloseTimer();
    closeFlyoutTimerRef.current = setTimeout(() => {
      setOpenFlyoutId(null);
      closeFlyoutTimerRef.current = null;
    }, 170);
  }, [clearFlyoutCloseTimer]);

  useEffect(() => {
    if (!isMarketingGlass && !isHomepagePresentation) {
      return;
    }

    const handleScroll = () => setIsScrolled(window.scrollY > 16);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => window.removeEventListener('scroll', handleScroll);
  }, [isHomepagePresentation, isMarketingGlass]);

  useEffect(() => {
    if (!isMarketingGlass || openFlyoutId === null) {
      return;
    }

    const closeIfOutside = (target: EventTarget | null) => {
      if (target instanceof Node && headerRef.current?.contains(target)) {
        return;
      }

      closeFlyout();
    };
    const handlePointerEnter = () => {
      clearFlyoutCloseTimer();
    };
    const handlePointerLeave = (event: PointerEvent) => {
      if (
        event.relatedTarget instanceof Node &&
        headerRef.current?.contains(event.relatedTarget)
      ) {
        return;
      }
      scheduleFlyoutClose();
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
    const flyoutPanels = Array.from(
      header?.querySelectorAll<HTMLElement>(
        '.marketing-glass-header__flyout'
      ) ?? []
    );
    header?.addEventListener('pointerenter', handlePointerEnter);
    header?.addEventListener('pointerleave', handlePointerLeave);
    for (const panel of flyoutPanels) {
      panel.addEventListener('pointerenter', handlePointerEnter);
    }
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      header?.removeEventListener('pointerenter', handlePointerEnter);
      header?.removeEventListener('pointerleave', handlePointerLeave);
      for (const panel of flyoutPanels) {
        panel.removeEventListener('pointerenter', handlePointerEnter);
      }
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    clearFlyoutCloseTimer,
    closeFlyout,
    isMarketingGlass,
    openFlyoutId,
    scheduleFlyoutClose,
  ]);

  useEffect(() => {
    return () => clearFlyoutCloseTimer();
  }, [clearFlyoutCloseTimer]);

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
  const leadingMarketingLinks = isMarketingGlass
    ? navLinks?.filter(link => link.treatment === 'wordmark')
    : undefined;
  const trailingNavLinks = isMarketingGlass
    ? navLinks?.filter(link => link.treatment !== 'wordmark')
    : navLinks;
  const renderNavLinks = (
    links: ReadonlyArray<HeaderNavLinkItem> | undefined
  ) =>
    links?.map(link => (
      <HeaderNavLink
        key={link.href}
        href={link.href}
        label={link.label}
        className={cn(
          navLinkClass,
          isMarketingGlass &&
            link.treatment === 'wordmark' &&
            'marketing-glass-header__brand-wordmark'
        )}
      />
    ));
  const navLinksMarkup = hasDesktopNavLinks ? (
    <div className={cn('max-lg:hidden items-center lg:flex', navGroupClass)}>
      {renderNavLinks(leadingMarketingLinks)}
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
                  onMouseEnter={() => openFlyout(menu.id)}
                  onPointerEnter={() => openFlyout(menu.id)}
                  onFocus={() => openFlyout(menu.id)}
                >
                  {menu.label}
                  <ChevronDown aria-hidden='true' size={13} strokeWidth={1.8} />
                </button>
                <MarketingGlassFlyout menu={menu} open={open} />
              </div>
            );
          })
        : null}
      {renderNavLinks(trailingNavLinks)}
    </div>
  ) : null;
  const containerClass =
    _containerSize === 'homepage'
      ? 'flex h-(--linear-header-height) w-full items-center gap-3 sm:gap-4 md:gap-6'
      : 'flex h-(--linear-header-height) w-full items-center gap-6';
  return (
    <header
      ref={headerRef}
      data-testid='header-nav'
      data-pen-contract={penContractId}
      data-presentation={presentation}
      data-scrolled={isScrolled ? 'true' : undefined}
      className={cn(
        'header-nav',
        isMarketingGlass
          ? 'marketing-glass-header fixed top-0 left-0 right-0 w-full'
          : 'fixed top-0 left-0 right-0 w-full transition-colors duration-subtle motion-reduce:transition-none',
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
        aria-label='Primary Navigation'
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

          {/* Auth actions */}
          <div
            className={cn(
              isMarketingGlass && hasMobileNavLinks
                ? 'hidden items-center gap-1 lg:flex'
                : 'flex items-center gap-1',
              isHomepagePresentation && 'homepage-header-auth'
            )}
          >
            {authMode === 'public-static' && isMarketingGlass ? (
              <GlassAuthActions
                publicCta={publicCta}
                showContactLink={showContactLink}
              />
            ) : authMode === 'public-static' ? (
              <PublicAuthActions
                minimal={minimalAuth}
                minimalVariant={minimalAuthVariant}
                publicCta={publicCta}
              />
            ) : (
              <AuthActions />
            )}
          </div>

          {/* Mobile hamburger menu - shown on small screens only */}
          {hasMobileNavLinks && (
            <div className='flex lg:hidden items-center'>
              <MobileNav
                navLinks={mobileLinks}
                includePublicLogin={includePublicLoginInMobileNav}
                publicCtaHref={publicCta?.href}
                publicCtaLabel={publicCta?.label}
                authenticatedUserSlot={<UserButton />}
              />
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
