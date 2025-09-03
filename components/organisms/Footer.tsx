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
  className = '',
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
      containerClass: 'bg-neutral-950 text-white dark:bg-black',
      contentClass:
        'mx-auto max-w-7xl px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3',
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
      containerClass:
        'border-t border-gray-200/50 dark:border-white/10 bg-white dark:bg-gray-900',
      contentClass:
        'flex flex-col md:flex-row items-center justify-between gap-6 py-8 md:h-16 md:py-0 w-full',
      colorVariant: 'light' as const,
      showBranding: false,
      layout: 'horizontal' as const,
      showLinks: true,
      themeAppearance: 'icon' as const,
    },
    regular: {
      // Clerk-like footer: subtle border top, compact spacing, segmented theme selector
      containerClass:
        'border-t border-gray-600/10 dark:border-gray-900 bg-white dark:bg-gray-900',
      contentClass:
        'mx-auto max-w-7xl px-4 pt-6 pb-6 flex items-center justify-between',
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
        <div className='flex flex-col items-center justify-center space-y-1.5'>
          <FooterBranding
            artistHandle={artistHandle}
            variant={config.colorVariant}
          />

          {/* Mobile privacy link */}
          <div className='mt-3 pt-3 border-t border-black/5 dark:border-white/10 w-full'>
            <div className='text-center md:hidden'>
              <FooterNavigation
                variant={config.colorVariant}
                links={[{ href: '/legal/privacy', label: 'Privacy' }]}
              />
            </div>
          </div>
        </div>

        {/* Desktop privacy link - positioned in bottom left corner */}
        <div className='hidden md:block fixed bottom-4 left-4 z-10'>
          <FooterNavigation
            variant={config.colorVariant}
            links={[{ href: '/legal/privacy', label: 'Privacy' }]}
          />
        </div>
      </footer>
    );
  }

  // Regular footer: full links grid (brand + Product, Company, Legal)
  if (variant === 'regular') {
    const productLinks = [
      { href: '/link-in-bio', label: 'Link in Bio' },
      { href: '/pricing', label: 'Pricing' },
      ...FEATURES.map(f => ({ href: f.href, label: f.title })),
    ];

    const companyLinks = [
      { href: '/support', label: 'Support' },
      // Additional company links can be added when routes exist
    ];

    const legalLinks = [
      { href: '/legal/privacy', label: 'Privacy Policy' },
      { href: '/legal/terms', label: 'Terms' },
    ];

    return (
      <footer
        className={`border-t border-gray-600/10 dark:border-gray-900 bg-white dark:bg-gray-900 ${className}`}
      >
        <div className='mx-auto max-w-7xl px-4 pt-10 pb-6'>
          <div className='grid grid-cols-1 md:grid-cols-4 gap-8'>
            {/* Brand */}
            <div>
              <FooterBranding variant='light' showCTA={false} />
            </div>

            {/* Product */}
            <div>
              <h3 className='text-sm font-semibold text-gray-900 dark:text-white mb-3'>
                Product
              </h3>
              <ul className='space-y-2'>
                {productLinks.map(link => (
                  <li key={`${link.href}-${link.label}`}>
                    <Link
                      href={link.href}
                      className='text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors'
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Company */}
            <div>
              <h3 className='text-sm font-semibold text-gray-900 dark:text-white mb-3'>
                Company
              </h3>
              <ul className='space-y-2'>
                {companyLinks.map(link => (
                  <li key={`${link.href}-${link.label}`}>
                    <Link
                      href={link.href}
                      className='text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors'
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h3 className='text-sm font-semibold text-gray-900 dark:text-white mb-3'>
                Legal
              </h3>
              <ul className='space-y-2'>
                {legalLinks.map(link => (
                  <li key={`${link.href}-${link.label}`}>
                    <Link
                      href={link.href}
                      className='text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors'
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className='mt-8 border-t border-gray-200 dark:border-gray-800 pt-5 flex items-center justify-between'>
            <div className='flex flex-col'>
              <Copyright variant='light' />
            </div>
            {showThemeToggle && (
              <div className='flex items-center'>
                <ThemeToggle appearance='segmented' />
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
            <div className='flex flex-col items-center md:items-start space-y-2'>
              <Copyright variant={config.colorVariant} />
              {variant === 'minimal' && (
                <p className='text-xs text-gray-400 dark:text-gray-500'>
                  Made for musicians, by musicians
                </p>
              )}
            </div>

            <div className='flex items-center gap-4'>
              {config.showLinks && (
                <FooterNavigation variant={config.colorVariant} links={links} />
              )}
              {showThemeToggle && (
                <div className='flex items-center'>
                  <ThemeToggle appearance={config.themeAppearance} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </footer>
  );
}
