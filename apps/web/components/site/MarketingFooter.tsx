'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { APP_ROUTES } from '@/constants/routes';
import {
  MARKETING_FOOTER_COLUMNS,
  MARKETING_LEGAL_LINKS,
  type MarketingFooterLink,
} from '@/data/marketingNavigation';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';
import { cn } from '@/lib/utils';
import { MarketingFooterCta } from './MarketingFooterCta';

/**
 * Marketing footer — frame.io-inspired premium density.
 *
 * Visual contract:
 * - #06070a base, hairline rgba(255,255,255,0.07) top border, subtle 220px
 *   ambient edge-glow at the seam.
 * - 4-column nav with caps eyebrow headers (11px / 0.2em tracking / muted),
 *   14px caption-weight links.
 * - Hairline-separated bottom band with copyright + legal — a sub-band, not
 *   a separate footer row.
 * - Wordmark column carries a small tagline below the mark for editorial
 *   weight.
 * - Minimal variant collapses to mark + bottom band only (used on
 *   /pricing, /legal/*).
 */

const MINIMAL_FOOTER_PATHS = new Set<string>([
  APP_ROUTES.PRICING,
  APP_ROUTES.LEGAL_PRIVACY,
  APP_ROUTES.LEGAL_TERMS,
]);
const PAGE_OWNS_FINAL_CTA_PATHS = new Set<string>([
  APP_ROUTES.HOME,
  APP_ROUTES.ARTIST_PROFILES,
  APP_ROUTES.ARTIST_NOTIFICATIONS,
  APP_ROUTES.LAUNCH,
]);

interface MarketingFooterProps {
  readonly variant?: 'auto' | 'expanded' | 'minimal';
  readonly className?: string;
  readonly showCta?: boolean;
}

const markLinkClassName =
  '-m-1.5 inline-flex rounded-full p-1.5 text-white/[0.92] transition-opacity duration-subtle hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-black';
const footerLinkClassName =
  'mf-link inline-flex w-fit rounded-[5px] text-[15px] leading-[1.45] tracking-[-0.005em] text-white/[0.72] transition-colors duration-subtle hover:text-white focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-black';
const footerLegalLinkClassName =
  'mf-legal-link inline-flex w-fit rounded-[5px] text-[12px] leading-5 tracking-[-0.01em] text-white/[0.5] transition-colors duration-subtle hover:text-white/70 focus-visible:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-black';

function FooterLink({ link }: Readonly<{ link: MarketingFooterLink }>) {
  return (
    <Link
      href={link.href}
      prefetch={link.external ? undefined : false}
      className={footerLinkClassName}
      target={link.external ? '_blank' : undefined}
      rel={link.external ? 'noreferrer' : undefined}
    >
      {link.label}
    </Link>
  );
}

export function MarketingFooter({
  variant = 'auto',
  className,
  showCta = true,
}: Readonly<MarketingFooterProps>) {
  const pathname = usePathname();
  const isMinimalPath = pathname && MINIMAL_FOOTER_PATHS.has(pathname);
  const autoVariant =
    FEATURE_FLAGS.SHOW_MARKETING_FULL_FOOTER && !isMinimalPath
      ? 'expanded'
      : 'minimal';
  const requestedVariant = variant === 'auto' ? autoVariant : variant;
  const resolvedVariant =
    requestedVariant === 'expanded' && !FEATURE_FLAGS.SHOW_MARKETING_FULL_FOOTER
      ? 'minimal'
      : requestedVariant;
  const isMinimal = resolvedVariant === 'minimal';
  const pageOwnsFinalCta =
    typeof pathname === 'string' && PAGE_OWNS_FINAL_CTA_PATHS.has(pathname);
  const shouldShowCta = showCta && !isMinimal && !pageOwnsFinalCta;
  const footerColumns =
    pathname === APP_ROUTES.HOME
      ? MARKETING_FOOTER_COLUMNS.filter(column => column.title !== 'Connect')
      : MARKETING_FOOTER_COLUMNS;

  return (
    <footer
      className={cn('marketing-footer-premium', className)}
      data-testid='marketing-footer'
    >
      <div
        className={cn(
          'mx-auto w-full max-w-[var(--linear-content-max)] px-[clamp(1.25rem,2.2vw,2rem)]',
          isMinimal
            ? 'pt-[clamp(3rem,5vw,4.5rem)] pb-[clamp(2.5rem,4vw,3.5rem)]'
            : shouldShowCta
              ? 'pt-0 pb-[clamp(2.5rem,4vw,3.5rem)]'
              : 'pt-[clamp(4rem,6.5vw,6rem)] pb-[clamp(2.5rem,4vw,3.5rem)]'
        )}
      >
        {shouldShowCta ? (
          <div className='-mx-[clamp(1.25rem,2.2vw,2rem)]'>
            <MarketingFooterCta />
          </div>
        ) : null}

        {isMinimal ? (
          <Link
            href={APP_ROUTES.HOME}
            prefetch={false}
            aria-label='Jovie home'
            className={markLinkClassName}
          >
            <BrandLogo size={22} tone='white' rounded={false} aria-hidden />
          </Link>
        ) : (
          <div className='grid gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,2.6fr)] md:gap-x-16 md:gap-y-14 lg:gap-x-24'>
            <div className='min-w-0'>
              <Link
                href={APP_ROUTES.HOME}
                prefetch={false}
                aria-label='Jovie home'
                className={markLinkClassName}
              >
                <BrandLogo size={22} tone='white' rounded={false} aria-hidden />
              </Link>
              <p className='mf-mark-tagline'>Built for artists. By artists.</p>
            </div>

            <nav
              className={cn(
                'grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:gap-x-12 xl:gap-x-16',
                footerColumns.length === 4
                  ? 'lg:grid-cols-4'
                  : 'lg:grid-cols-5',
                shouldShowCta && 'mt-[clamp(3.25rem,5vw,4.6rem)]'
              )}
              aria-label='Footer'
            >
              {footerColumns.map(column => (
                <section key={column.title}>
                  <h2 className='mf-eyebrow mf-eyebrow--caps'>
                    {column.title}
                  </h2>
                  <ul className='flex list-none flex-col gap-3 p-0'>
                    {column.links.map(link => (
                      <li key={`${link.href}-${link.label}`}>
                        <FooterLink link={link} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </nav>
          </div>
        )}

        <div
          className={cn(
            'mf-baseband flex flex-wrap items-center justify-between gap-x-7 gap-y-2'
          )}
          style={isMinimal ? { marginTop: '1.75rem' } : undefined}
        >
          <span className='text-[12px] leading-[1.45] tracking-[-0.005em] text-white/[0.5]'>
            © {new Date().getFullYear()} Jovie Technology Inc.
          </span>
          <nav aria-label='Legal' className='flex flex-wrap items-center gap-6'>
            {MARKETING_LEGAL_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                prefetch={false}
                className={footerLegalLinkClassName}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
