'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Copyright } from '@/components/atoms/Copyright';
import { FooterBranding } from '@/components/molecules/FooterBranding';
import { FooterNavigation } from '@/components/molecules/FooterNavigation';
import { APP_ROUTES } from '@/constants/routes';
import { useAppFlag } from '@/lib/flags/client';
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
      { href: '/artist-profiles', label: 'Artist Profiles' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/support', label: 'Support' },
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
    id: 'account',
    heading: 'Account',
    links: [
      { href: '/signin', label: 'Log in' },
      { href: '/signup', label: 'Get started' },
    ],
  },
  {
    id: 'legal',
    heading: 'Legal',
    links: [
      { href: APP_ROUTES.LEGAL_PRIVACY, label: 'Privacy' },
      { href: APP_ROUTES.LEGAL_TERMS, label: 'Terms' },
    ],
  },
] as const;

const PROFILE_LEGAL_LINKS = [
  { href: APP_ROUTES.LEGAL_PRIVACY, label: 'Privacy' },
  { href: APP_ROUTES.LEGAL_TERMS, label: 'Terms' },
];

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
  showThemeToggle = false,
  themeShortcutKey,
  className = '',
  brandingMark = 'icon',
  containerSize = 'lg',
  links,
}: FooterProps) {
  const isLightModeEnabled = useAppFlag('ENABLE_LIGHT_MODE');
  const effectiveShowThemeToggle = showThemeToggle && isLightModeEnabled;
  const maxWidthClass = CONTAINER_SIZES[containerSize];

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
            links={PROFILE_LEGAL_LINKS}
            className='gap-2 text-[10px] leading-4'
            linkClassName='text-[10px] leading-4 opacity-60 hover:opacity-100'
          />
        </div>

        <div className='max-md:hidden fixed bottom-4 left-4 z-10'>
          <FooterNavigation
            variant={config.colorVariant}
            ariaLabel='Legal'
            links={PROFILE_LEGAL_LINKS}
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
              ? 'px-5 sm:px-6 lg:px-0'
              : 'mx-auto px-6 lg:px-8',
            'pt-16 pb-14',
            maxWidthClass
          )}
        >
          <div className='grid gap-12 lg:grid-cols-[96px_minmax(0,1fr)] lg:gap-20'>
            <div className='flex flex-col items-start text-left'>
              <FooterBranding
                variant='linear'
                showCTA={false}
                mark={brandingMark}
                className='items-start'
              />
            </div>

            <div className='grid w-full grid-cols-2 gap-x-10 gap-y-10 text-left sm:grid-cols-4 sm:gap-x-12 lg:gap-x-16'>
              {FOOTER_COLUMNS.map(col => (
                <nav key={col.id} aria-labelledby={`footer-${col.id}-heading`}>
                  <h2
                    id={`footer-${col.id}-heading`}
                    className={SECTION_HEADING_CLASS_NAME}
                    style={SECTION_HEADING_STYLE}
                  >
                    {col.heading}
                  </h2>
                  <ul className='flex flex-col gap-2.5'>
                    {col.links.map(link => (
                      <li key={`${link.href}-${link.label}`}>
                        <Link
                          href={link.href}
                          prefetch={false}
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

          <div className='mt-14'>
            <div className='flex flex-col items-start gap-4 border-t border-white/8 pt-6 sm:flex-row sm:items-center sm:justify-between'>
              <div className='flex items-center gap-4'>
                <Link
                  href={APP_ROUTES.LEGAL_PRIVACY}
                  prefetch={false}
                  className='text-[13px] tracking-[-0.01em] transition-colors duration-100 hover:[color:var(--linear-text-primary)]'
                  style={{ color: 'var(--linear-text-tertiary)' }}
                >
                  Privacy
                </Link>
                <Link
                  href={APP_ROUTES.LEGAL_TERMS}
                  prefetch={false}
                  className='text-[13px] tracking-[-0.01em] transition-colors duration-100 hover:[color:var(--linear-text-primary)]'
                  style={{ color: 'var(--linear-text-tertiary)' }}
                >
                  Terms
                </Link>
              </div>
              <Copyright
                variant='light'
                className='text-[11px] leading-[16px] font-normal tracking-[-0.01em] opacity-100'
                style={{
                  color: 'var(--linear-text-tertiary)',
                }}
              />
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
            ? 'px-5 sm:px-6 lg:px-0'
            : 'mx-auto px-6 lg:px-8',
          'flex flex-col md:flex-row items-center justify-between gap-4 py-8 md:py-10',
          CONTAINER_SIZES[containerSize]
        )}
      >
        {config.layout === 'horizontal' && (
          <>
            <div
              className={`flex items-center ${variant === 'minimal' ? 'gap-3' : 'gap-4'}`}
            >
              {config.showLinks && links && links.length > 0 && (
                <nav aria-label='Legal' className='flex items-center gap-3'>
                  {links.map(link => (
                    <Link
                      key={link.href}
                      href={link.href}
                      prefetch={false}
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
                  <div className='max-md:hidden md:flex items-center'>
                    <ThemeToggle
                      appearance={config.themeAppearance}
                      shortcutKey={themeShortcutKey}
                      variant='linear'
                    />
                  </div>
                </>
              )}
            </div>
            <Copyright
              variant={config.colorVariant}
              className='text-[11px] leading-[16px] font-normal tracking-[-0.01em] opacity-100'
              style={{
                color: 'var(--linear-text-tertiary)',
              }}
            />
          </>
        )}
      </div>
    </footer>
  );
}
