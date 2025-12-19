import Link from 'next/link';
import { Copyright } from '@/components/atoms/Copyright';
import { FooterBranding } from '@/components/molecules/FooterBranding';
import { FooterNavigation } from '@/components/molecules/FooterNavigation';
import { ThemeToggle } from '@/components/site/ThemeToggle';
import { FEATURES } from '@/lib/features';

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
  links,
}: FooterProps) {
  // Use user's setting if available, otherwise fall back to hideBranding prop
  const shouldHideBranding = artistSettings?.hide_branding ?? hideBranding;

  // Profile footer logic - hide if branding should be hidden
  if (variant === 'profile' && shouldHideBranding) {
    return null;
  }

  // Variant-specific configurations
  const variantConfigs = {
    marketing: {
      containerClass: 'bg-black text-white',
      contentClass:
        'mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-4',
      colorVariant: 'dark' as const,
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
      contentClass:
        'mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-3 py-5 md:h-16 md:py-0',
      colorVariant: 'light' as const,
      showBranding: false,
      layout: 'horizontal' as const,
      showLinks: true,
      themeAppearance: 'segmented' as const,
    },
    regular: {
      // Clerk-like footer: subtle border top, compact spacing, segmented theme selector
      containerClass: 'border-t border-subtle bg-base',
      contentClass:
        'mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-6 pb-6 flex items-center justify-between',
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
        <div className='flex flex-col items-center justify-center space-y-1.5 pb-4'>
          <FooterBranding
            artistHandle={artistHandle}
            variant={config.colorVariant}
            size='sm'
          />
        </div>

        {/* Mobile privacy link - small and corner-aligned to keep footer tight */}
        <div className='md:hidden absolute bottom-2 right-4 text-[11px]'>
          <FooterNavigation
            variant={config.colorVariant}
            ariaLabel='Legal'
            links={[{ href: '/legal/privacy', label: 'Privacy' }]}
          />
        </div>

        {/* Desktop privacy link - positioned in bottom left corner */}
        <div className='hidden md:block fixed bottom-4 left-4 z-10'>
          <FooterNavigation
            variant={config.colorVariant}
            ariaLabel='Legal'
            links={[{ href: '/legal/privacy', label: 'Privacy' }]}
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

    return (
      <footer className={`border-t border-subtle bg-base ${className}`}>
        <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-10 pb-6'>
          <div className='grid grid-cols-1 md:grid-cols-4 gap-8'>
            {/* Brand */}
            <div>
              <FooterBranding
                variant='light'
                showCTA={false}
                mark={brandingMark}
                className={brandingMark === 'icon' ? 'items-start' : ''}
              />
            </div>

            {/* Product */}
            <div>
              <h3 className='text-sm font-semibold text-primary-token mb-3'>
                Product
              </h3>
              <ul className='space-y-2'>
                {productLinks.map(link => (
                  <li key={`${link.href}-${link.label}`}>
                    <Link
                      href={link.href}
                      className='text-sm text-secondary-token hover:text-primary-token transition-colors'
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Company */}
            <div>
              <h3 className='text-sm font-semibold text-primary-token mb-3'>
                Company
              </h3>
              <ul className='space-y-2'>
                {companyLinks.map(link => (
                  <li key={`${link.href}-${link.label}`}>
                    <Link
                      href={link.href}
                      className='text-sm text-secondary-token hover:text-primary-token transition-colors'
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h3 className='text-sm font-semibold text-primary-token mb-3'>
                Legal
              </h3>
              <ul className='space-y-2'>
                {legalLinks.map(link => (
                  <li key={`${link.href}-${link.label}`}>
                    <Link
                      href={link.href}
                      className='text-sm text-secondary-token hover:text-primary-token transition-colors'
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className='mt-8 border-t border-subtle pt-5 flex items-center justify-between'>
            <div className='flex flex-col'>
              <Copyright
                variant='light'
                className='text-[11px] tracking-tight text-tertiary-token'
              />
            </div>
            {showThemeToggle && (
              <div className='flex items-center'>
                <ThemeToggle
                  appearance='segmented'
                  shortcutKey={themeShortcutKey}
                />
              </div>
            )}
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
                    ? 'text-[11px] tracking-tight text-secondary-token'
                    : undefined
                }
              />
              {variant === 'minimal' && (
                <p className='text-[11px] tracking-tight text-tertiary-token'>
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
                  className={variant === 'minimal' ? 'gap-2' : ''}
                  linkClassName={
                    variant === 'minimal'
                      ? 'text-[11px] tracking-tight font-medium'
                      : ''
                  }
                />
              )}
              {showThemeToggle && (
                <div className='flex items-center'>
                  <ThemeToggle
                    appearance={config.themeAppearance}
                    shortcutKey={themeShortcutKey}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </footer>
  );
}
