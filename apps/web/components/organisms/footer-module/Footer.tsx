'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Copyright } from '@/components/atoms/Copyright';
import { FooterBranding } from '@/components/molecules/FooterBranding';
import { FooterNavigation } from '@/components/molecules/FooterNavigation';
import { APP_ROUTES } from '@/constants/routes';
import { useFeatureGate } from '@/lib/feature-flags/client';
import { FEATURE_FLAG_KEYS } from '@/lib/feature-flags/shared';
import { cn } from '@/lib/utils';

// Dynamic import to exclude ThemeToggle from bundle when not used
const ThemeToggle = dynamic(
  () =>
    import('@/components/site/theme-toggle').then(mod => ({
      default: mod.ThemeToggle,
    })),
  { ssr: false }
);

const FOOTER_COLUMNS = [
  {
    id: 'product',
    heading: 'Product',
    links: [
      { href: '/#release', label: 'Smart Links' },
      { href: '/#profile', label: 'Artist Profile' },
      { href: '/#release', label: 'Release Automation' },
      { href: '/#audience', label: 'Audience Intelligence' },
      { href: '/#ai', label: 'AI Assistant' },
      { href: '/pricing', label: 'Pricing' },
    ],
  },
  {
    id: 'features',
    heading: 'Features',
    links: [
      { href: '/#analytics', label: 'Analytics' },
      { href: '/#profile', label: 'Fan Capture' },
      { href: '/#profile', label: 'Tipping' },
      { href: '/#profile', label: 'Tour Dates' },
    ],
  },
  {
    id: 'company',
    heading: 'Company',
    links: [
      { href: '/blog', label: 'Blog' },
      { href: '/changelog', label: 'Changelog' },
    ],
  },
  {
    id: 'resources',
    heading: 'Resources',
    links: [{ href: '/support', label: 'Support' }],
  },
  {
    id: 'connect',
    heading: 'Connect',
    links: [
      { href: 'https://x.com/jovieapp', label: 'X (Twitter)' },
      { href: 'https://instagram.com/jovieapp', label: 'Instagram' },
    ],
  },
] as const;

import {
  CONTAINER_SIZES,
  FOOTER_LINK_CLASS_NAME,
  FOOTER_LINK_HOVER_CLASS,
  FOOTER_LINK_STYLE,
  getVariantConfigs,
  SECTION_HEADING_CLASS_NAME,
  SECTION_HEADING_STYLE,
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
  brandingMark = 'icon',
  containerSize = 'lg',
  links,
}: FooterProps) {
  const isLightModeEnabled = useFeatureGate(
    FEATURE_FLAG_KEYS.ENABLE_LIGHT_MODE,
    false
  );
  const effectiveShowThemeToggle = showThemeToggle && isLightModeEnabled;
  const shouldHideBranding = artistSettings?.hide_branding ?? hideBranding;
  const maxWidthClass = CONTAINER_SIZES[containerSize];

  if (variant === 'profile' && shouldHideBranding) {
    return null;
  }

  const variantConfigs = getVariantConfigs(maxWidthClass, containerSize);
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
            mark='text'
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
    return (
      // biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label needed for footer accessibility
      <footer
        className={className}
        style={{ backgroundColor: 'var(--linear-bg-footer)' }}
        aria-label='Site footer'
      >
        <div
          aria-hidden='true'
          className='h-px'
          style={{
            background: `linear-gradient(to right, var(--linear-border-footer), var(--linear-border-footer) 40%, transparent)`,
          }}
        />
        <div
          className={cn(
            containerSize === 'homepage'
              ? 'px-5 sm:px-6 lg:px-[77px]'
              : 'mx-auto px-6 lg:px-8',
            'pt-14 pb-14',
            maxWidthClass
          )}
        >
          <div className='flex flex-col items-center gap-12 lg:gap-16 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] sm:items-start'>
            <div className='flex flex-col items-center text-center sm:items-start sm:text-left'>
              <FooterBranding
                variant='linear'
                showCTA={false}
                mark={brandingMark}
                className={cn(
                  'items-center sm:items-start',
                  brandingMark === 'icon' ? 'sm:justify-start' : ''
                )}
              />
            </div>

            <div className='grid w-full grid-cols-2 gap-10 text-center sm:grid-cols-3 sm:gap-8 sm:text-left lg:grid-cols-5 lg:gap-10'>
              {FOOTER_COLUMNS.map(col => (
                <nav key={col.id} aria-labelledby={`footer-${col.id}-heading`}>
                  <h2
                    id={`footer-${col.id}-heading`}
                    className={SECTION_HEADING_CLASS_NAME}
                    style={SECTION_HEADING_STYLE}
                  >
                    {col.heading}
                  </h2>
                  <ul className='flex flex-col gap-0.5'>
                    {col.links.map(link => (
                      <li key={`${link.href}-${link.label}`}>
                        <Link
                          href={link.href}
                          className={cn(
                            FOOTER_LINK_CLASS_NAME,
                            FOOTER_LINK_HOVER_CLASS
                          )}
                          style={FOOTER_LINK_STYLE}
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              ))}
            </div>
          </div>

          <div className='mt-16'>
            <div className='flex flex-col items-center gap-4 sm:flex-row sm:justify-between'>
              <Copyright
                variant='light'
                className='order-2 text-[11px] leading-[16px] font-normal tracking-[-0.01em] sm:order-1'
                style={{
                  color: 'var(--linear-text-tertiary)',
                }}
              />
              <div className='flex items-center gap-4 order-1 sm:order-2'>
                <Link
                  href={APP_ROUTES.LEGAL_PRIVACY}
                  className='text-[13px] tracking-[-0.01em] transition-colors duration-100 hover:[color:var(--linear-text-primary)]'
                  style={{ color: 'var(--linear-text-tertiary)' }}
                >
                  Privacy
                </Link>
                <Link
                  href={APP_ROUTES.LEGAL_TERMS}
                  className='text-[13px] tracking-[-0.01em] transition-colors duration-100 hover:[color:var(--linear-text-primary)]'
                  style={{ color: 'var(--linear-text-tertiary)' }}
                >
                  Terms
                </Link>
              </div>
            </div>
          </div>
        </div>
      </footer>
    );
  }

  // Minimal/Marketing footer with Linear styling
  return (
    <footer
      className={className}
      style={{ backgroundColor: 'var(--linear-bg-footer)' }}
    >
      {/* Gradient separator — matches logo bar treatment */}
      <div
        aria-hidden='true'
        className='h-px'
        style={{
          background: `linear-gradient(to right, var(--linear-border-footer), var(--linear-border-footer) 40%, transparent)`,
        }}
      />
      <div
        className={cn(
          containerSize === 'homepage'
            ? 'px-5 sm:px-6 lg:px-[77px]'
            : 'mx-auto px-6 lg:px-8',
          'flex flex-col md:flex-row items-center justify-between gap-4 py-8 md:py-10',
          CONTAINER_SIZES[containerSize]
        )}
      >
        {config.layout === 'horizontal' && (
          <>
            <div
              className={`flex flex-col items-center md:items-start ${variant === 'minimal' ? 'space-y-1' : 'space-y-2'}`}
            >
              <Copyright
                variant={config.colorVariant}
                className='text-[11px] leading-[16px] font-normal tracking-[-0.01em] opacity-100'
                style={{
                  color: 'var(--linear-text-tertiary)',
                }}
              />
              {/* Removed "Made for musicians" tagline — tightened per JOV-1094 */}
            </div>

            <div
              className={`flex items-center ${variant === 'minimal' ? 'gap-3' : 'gap-4'}`}
            >
              {config.showLinks && links && links.length > 0 && (
                <nav aria-label='Legal' className='flex items-center gap-3'>
                  {links.map(link => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className='text-[13px] leading-[19.5px] font-normal tracking-[-0.01em] transition-colors duration-100 hover:[color:var(--linear-text-secondary)]'
                      style={{ color: 'var(--linear-text-tertiary)' }}
                    >
                      {link.label}
                    </Link>
                  ))}
                </nav>
              )}
              {effectiveShowThemeToggle && (
                <>
                  <div className='flex items-center md:hidden'>
                    <ThemeToggle
                      appearance='icon'
                      shortcutKey={themeShortcutKey}
                      variant='linear'
                    />
                  </div>
                  <div className='hidden md:flex items-center'>
                    <ThemeToggle
                      appearance={config.themeAppearance}
                      shortcutKey={themeShortcutKey}
                      variant='linear'
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
