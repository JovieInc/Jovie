'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Copyright } from '@/components/atoms/Copyright';
import { CookieSettingsFooterButton } from '@/components/molecules/CookieSettingsFooterButton';
import { FooterBranding } from '@/components/molecules/FooterBranding';
import { FooterNavigation } from '@/components/molecules/FooterNavigation';
import { FEATURES } from '@/lib/features';
import { cn } from '@/lib/utils';

// Dynamic import to exclude ThemeToggle from bundle when not used
const ThemeToggle = dynamic(
  () =>
    import('@/components/site/theme-toggle').then(mod => ({
      default: mod.ThemeToggle,
    })),
  { ssr: false }
);

import {
  CONTAINER_SIZES,
  FOOTER_LINK_CLASS_NAME,
  getVariantConfigs,
  SECTION_HEADING_CLASS_NAME,
} from './config';
import type { FooterProps } from './types';

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
  const shouldHideBranding = artistSettings?.hide_branding ?? hideBranding;
  const maxWidthClass = CONTAINER_SIZES[containerSize];

  if (variant === 'profile' && shouldHideBranding) {
    return null;
  }

  const variantConfigs = getVariantConfigs(maxWidthClass);
  const config = variantConfigs[variant];

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

        <div className='md:hidden absolute bottom-2 right-4'>
          <FooterNavigation
            variant={config.colorVariant}
            ariaLabel='Legal'
            links={[]}
            className='gap-2 text-[10px] leading-4'
            linkClassName='text-[10px] leading-4 opacity-60 hover:opacity-100'
          />
        </div>

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

  if (variant === 'regular') {
    const productLinks = [
      { href: '/link-in-bio', label: 'Profile' },
      { href: '/pricing', label: 'Pricing' },
      ...FEATURES.map(f => ({ href: f.href, label: f.title })),
    ];

    const companyLinks = [{ href: '/support', label: 'Support' }];

    const legalLinks = [
      { href: '/legal/privacy', label: 'Privacy Policy' },
      { href: '/legal/terms', label: 'Terms of Service' },
    ];

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
          <div className='flex flex-col items-center gap-10 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,2.5fr)] sm:items-start sm:gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]'>
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

            <div className='grid w-full grid-cols-2 gap-8 text-center sm:grid-cols-2 sm:gap-6 sm:text-left lg:grid-cols-3'>
              <nav aria-labelledby='footer-product-heading'>
                <h3
                  id='footer-product-heading'
                  className={SECTION_HEADING_CLASS_NAME}
                >
                  Product
                </h3>
                <ul className='space-y-1'>
                  {productLinks.map(link => (
                    <li key={`${link.href}-${link.label}`}>
                      <Link href={link.href} className={FOOTER_LINK_CLASS_NAME}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>

              <nav aria-labelledby='footer-company-heading'>
                <h3
                  id='footer-company-heading'
                  className={SECTION_HEADING_CLASS_NAME}
                >
                  Company
                </h3>
                <ul className='space-y-1'>
                  {companyLinks.map(link => (
                    <li key={`${link.href}-${link.label}`}>
                      <Link href={link.href} className={FOOTER_LINK_CLASS_NAME}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>

              <nav
                aria-labelledby='footer-legal-heading'
                className='col-span-2 sm:col-span-1'
              >
                <h3
                  id='footer-legal-heading'
                  className={SECTION_HEADING_CLASS_NAME}
                >
                  Legal
                </h3>
                <ul className='space-y-1'>
                  {legalLinks.map(link => (
                    <li key={`${link.href}-${link.label}`}>
                      <Link href={link.href} className={FOOTER_LINK_CLASS_NAME}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <CookieSettingsFooterButton
                      className={FOOTER_LINK_CLASS_NAME}
                    />
                  </li>
                </ul>
              </nav>
            </div>
          </div>

          <div className='mt-10 sm:mt-8 border-t border-subtle pt-6 sm:pt-5'>
            <div className='flex flex-col items-center gap-4 sm:flex-row sm:justify-between'>
              <Copyright
                variant='light'
                className='text-[11px] leading-4 font-medium tracking-[-0.01em] text-tertiary-token order-2 sm:order-1'
              />
              {showThemeToggle && (
                <div className='flex items-center gap-3 order-1 sm:order-2'>
                  <div className='flex items-center sm:hidden'>
                    <ThemeToggle
                      appearance='icon'
                      shortcutKey={themeShortcutKey}
                    />
                  </div>
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
                <p className='text-[10px] leading-4 font-normal tracking-tight text-[#6b6f76] dark:text-[#505257]'>
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
