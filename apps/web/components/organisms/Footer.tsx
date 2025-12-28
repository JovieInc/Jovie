import Link from 'next/link';
import { Copyright } from '@/components/atoms/Copyright';
import { CookieSettingsFooterButton } from '@/components/molecules/CookieSettingsFooterButton';
import { FooterBranding } from '@/components/molecules/FooterBranding';
import { FooterNavigation } from '@/components/molecules/FooterNavigation';
import { ThemeToggle } from '@/components/site/ThemeToggle';
import { FEATURES } from '@/lib/features';
import { cn } from '@/lib/utils';

export interface FooterProps {
  variant?: 'marketing' | 'profile' | 'minimal' | 'regular';
  artistHandle?: string;
  hideBranding?: boolean;
  artistSettings?: {
    hide_branding?: boolean;
  };
  showThemeToggle?: boolean;
  className?: string;
  themeShortcutKey?: string;
  brandingMark?: 'wordmark' | 'icon';
  containerSize?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  links?: Array<{
    href: string;
    label: string;
  }>;
}

export function Footer({
  variant = 'marketing',
  artistHandle,
  hideBranding = false,
  artistSettings,
  showThemeToggle = false,
  themeShortcutKey,
  className = '',
  brandingMark = 'wordmark',
  containerSize = 'lg',
  links,
}: FooterProps) {
  // Use user's setting if available, otherwise fall back to hideBranding prop
  const shouldHideBranding = artistSettings?.hide_branding ?? hideBranding;

  const containerSizes = {
    sm: 'max-w-3xl',
    md: 'max-w-5xl',
    lg: 'max-w-6xl',
    xl: 'max-w-7xl',
    full: 'max-w-none',
  } as const;

  const maxWidthClass = containerSizes[containerSize];

  // Profile footer logic - hide if branding should be hidden
  if (variant === 'profile' && shouldHideBranding) {
    return null;
  }

  // Variant-specific configurations
  const variantConfigs = {
    marketing: {
      containerClass: 'border-t border-subtle bg-base',
      contentClass: cn(
        'mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-4',
        maxWidthClass
      ),
      colorVariant: 'light' as const,
      showBranding: false,
      layout: 'horizontal' as const,
      showLinks: true,
      themeAppearance: 'icon' as const,
    },
    profile: {
      containerClass: 'relative mt-6 pt-4',
      contentClass: '',
      colorVariant: 'light' as const,
      showBranding: true,
      layout: 'vertical' as const,
      showLinks: true,
      themeAppearance: 'icon' as const,
    },
    minimal: {
      containerClass: 'border-t border-subtle bg-base',
      contentClass: cn(
        'mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-3 py-5 md:h-16 md:py-0',
        maxWidthClass
      ),
      colorVariant: 'light' as const,
      showBranding: false,
      layout: 'horizontal' as const,
      showLinks: true,
      themeAppearance: 'segmented' as const,
    },
    regular: {
      // Clerk-like footer: subtle border top, compact spacing, segmented theme selector
      containerClass: 'border-t border-subtle bg-base',
      contentClass: cn(
        'mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-6 flex items-center justify-between',
        maxWidthClass
      ),
      colorVariant: 'light' as const,
      showBranding: false,
      layout: 'horizontal' as const,
      showLinks: false,
      themeAppearance: 'segmented' as const,
    },
  };

  const config = variantConfigs[variant];

  // Profile footer has special positioning for privacy link
  if (variant === 'profile') {
    return (
      <footer className={`${config.containerClass} ${className}`}>
        <div className='flex flex-col items-center justify-center space-y-1.5 pb-2'>
          <FooterBranding
            artistHandle={artistHandle}
            variant={config.colorVariant}
            size='sm'
            showCTA={false}
            mark='wordmark'
          />
        </div>

        {/* Mobile privacy link - small and corner-aligned to keep footer tight */}
        <div className='md:hidden absolute bottom-2 right-4'>
          <FooterNavigation
            variant={config.colorVariant}
            ariaLabel='Legal'
            links={[]}
            className='gap-2 text-[10px] leading-4'
            linkClassName='text-[10px] leading-4 opacity-60 hover:opacity-100'
          />
        </div>

        {/* Desktop privacy link - positioned in bottom left corner */}
        <div className='hidden md:block fixed bottom-4 left-4 z-10'>
          <FooterNavigation
            variant={config.colorVariant}
            ariaLabel='Legal'
            links={[]}
            className='gap-2 text-[10px] leading-4'
            linkClassName='text-[10px] leading-4 opacity-60 hover:opacity-100'
          />
        </div>
      </footer>
    );
  }

  // Regular footer: full links grid (brand + Product, Company, Legal)
  if (variant === 'regular') {
    const productLinks = [
      { href: '/link-in-bio', label: 'Profile' },
      { href: '/pricing', label: 'Pricing' },
      ...FEATURES.map(f => ({ href: f.href, label: f.title })),
    ];

    const companyLinks = [
      { href: '/support', label: 'Support' },
      // Additional company links can be added when routes exist
    ];

    const legalLinks = [
      { href: '/legal/privacy', label: 'Privacy Policy' },
      { href: '/legal/terms', label: 'Terms of Service' },
    ];

    // Linear-inspired link styling with smooth transitions and accessible focus states
    const footerLinkClassName = cn(
      'inline-flex rounded-md px-2 py-1.5 -mx-2 -my-1.5',
      'text-[13px] leading-5 font-medium tracking-[-0.01em]',
      'text-secondary-token hover:text-primary-token',
      'transition-all duration-150 ease-out',
      'hover:bg-surface-1',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-2 focus-visible:ring-offset-transparent'
    );

    // Linear-style section heading - uppercase, small, muted
    const sectionHeadingClassName =
      'text-[11px] leading-4 font-semibold tracking-[0.04em] uppercase text-tertiary-token mb-4';

    return (
      // biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label needed for footer accessibility
      <footer
        className={cn('border-t border-subtle bg-base', className)}
        aria-label='Site footer'
      >
        <div
          className={cn(
            'mx-auto px-5 sm:px-6 lg:px-8 pt-12 pb-8 sm:pt-10 sm:pb-6',
            maxWidthClass
          )}
        >
          {/* Mobile: centered single column, Desktop: two column grid */}
          <div className='flex flex-col items-center gap-10 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,2.5fr)] sm:items-start sm:gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]'>
            {/* Brand */}
            <div className='flex flex-col items-center text-center sm:items-start sm:text-left'>
              <FooterBranding
                variant='light'
                showCTA={false}
                mark={brandingMark}
                className={cn(
                  'items-center sm:items-start',
                  brandingMark === 'icon' ? 'sm:justify-start' : ''
                )}
              />
            </div>

            {/* Links grid - centered on mobile, responsive grid on larger screens */}
            <div className='grid w-full grid-cols-2 gap-8 text-center sm:grid-cols-2 sm:gap-6 sm:text-left lg:grid-cols-3'>
              {/* Product */}
              <nav aria-labelledby='footer-product-heading'>
                <h3
                  id='footer-product-heading'
                  className={sectionHeadingClassName}
                >
                  Product
                </h3>
                <ul className='space-y-1'>
                  {productLinks.map(link => (
                    <li key={`${link.href}-${link.label}`}>
                      <Link href={link.href} className={footerLinkClassName}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>

              {/* Company */}
              <nav aria-labelledby='footer-company-heading'>
                <h3
                  id='footer-company-heading'
                  className={sectionHeadingClassName}
                >
                  Company
                </h3>
                <ul className='space-y-1'>
                  {companyLinks.map(link => (
                    <li key={`${link.href}-${link.label}`}>
                      <Link href={link.href} className={footerLinkClassName}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>

              {/* Legal */}
              <nav
                aria-labelledby='footer-legal-heading'
                className='col-span-2 sm:col-span-1'
              >
                <h3
                  id='footer-legal-heading'
                  className={sectionHeadingClassName}
                >
                  Legal
                </h3>
                <ul className='space-y-1'>
                  {legalLinks.map(link => (
                    <li key={`${link.href}-${link.label}`}>
                      <Link href={link.href} className={footerLinkClassName}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <CookieSettingsFooterButton
                      className={footerLinkClassName}
                    />
                  </li>
                </ul>
              </nav>
            </div>
          </div>

          {/* Bottom bar with copyright and theme toggle */}
          <div className='mt-10 sm:mt-8 border-t border-subtle pt-6 sm:pt-5'>
            <div className='flex flex-col items-center gap-4 sm:flex-row sm:justify-between'>
              <Copyright
                variant='light'
                className='text-[11px] leading-4 font-medium tracking-[-0.01em] text-tertiary-token order-2 sm:order-1'
              />
              {showThemeToggle && (
                <div className='flex items-center gap-3 order-1 sm:order-2'>
                  {/* Mobile: icon toggle */}
                  <div className='flex items-center sm:hidden'>
                    <ThemeToggle
                      appearance='icon'
                      shortcutKey={themeShortcutKey}
                    />
                  </div>
                  {/* Desktop: segmented toggle */}
                  <div className='hidden sm:flex items-center'>
                    <ThemeToggle
                      appearance='segmented'
                      shortcutKey={themeShortcutKey}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </footer>
    );
  }

  // Horizontal layout for marketing and minimal variants
  return (
    <footer className={`${config.containerClass} ${className}`}>
      <div className={config.contentClass}>
        {config.layout === 'horizontal' && (
          <>
            <div
              className={`flex flex-col items-center md:items-start ${variant === 'minimal' ? 'space-y-1' : 'space-y-2'}`}
            >
              <Copyright
                variant={config.colorVariant}
                className={
                  variant === 'minimal'
                    ? 'text-[11px] leading-4 font-medium tracking-tight text-secondary-token'
                    : 'text-[12px] leading-4 font-medium tracking-tight text-tertiary-token'
                }
              />
              {variant === 'minimal' && (
                <p className='text-[11px] leading-4 font-medium tracking-tight text-tertiary-token'>
                  Made for musicians, by musicians
                </p>
              )}
            </div>

            <div
              className={`flex items-center ${variant === 'minimal' ? 'gap-2' : 'gap-4'}`}
            >
              {config.showLinks && (
                <FooterNavigation
                  variant={config.colorVariant}
                  ariaLabel={variant === 'minimal' ? 'Legal' : undefined}
                  links={links}
                  className={
                    variant === 'minimal'
                      ? 'gap-2 flex-wrap justify-center'
                      : ''
                  }
                  linkClassName={
                    variant === 'minimal'
                      ? 'text-[11px] leading-4 font-medium tracking-tight'
                      : ''
                  }
                />
              )}
              {showThemeToggle && (
                <>
                  <div className='flex items-center md:hidden'>
                    <ThemeToggle
                      appearance='icon'
                      shortcutKey={themeShortcutKey}
                    />
                  </div>
                  <div className='hidden md:flex items-center'>
                    <ThemeToggle
                      appearance={config.themeAppearance}
                      shortcutKey={themeShortcutKey}
                    />
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </footer>
  );
}
