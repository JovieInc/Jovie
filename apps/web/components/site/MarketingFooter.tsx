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
import { cn } from '@/lib/utils';
import { MarketingFooterCta } from './MarketingFooterCta';

const MINIMAL_FOOTER_PATHS = new Set<string>([
  APP_ROUTES.LEGAL_PRIVACY,
  APP_ROUTES.LEGAL_TERMS,
]);
const PAGE_OWNS_FINAL_CTA_PATHS = new Set<string>([
  APP_ROUTES.HOME,
  APP_ROUTES.ARTIST_PROFILES,
  '/artist-profile',
  APP_ROUTES.ARTIST_NOTIFICATIONS,
  APP_ROUTES.LAUNCH,
]);

interface MarketingFooterProps {
  readonly variant?: 'auto' | 'expanded' | 'minimal';
  readonly className?: string;
  readonly showCta?: boolean;
}

const footerLinkClassName = 'mf-link';
const footerLegalLinkClassName = 'mf-legal-link';

const markLinkClassName =
  '-m-1.5 inline-flex rounded-full p-1.5 text-white/[0.92] transition-opacity duration-150 hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-black';

interface FooterLinkProps {
  readonly link: MarketingFooterLink;
  readonly className?: string;
}

function FooterLink({
  link,
  className = footerLinkClassName,
}: FooterLinkProps) {
  return (
    <Link
      href={link.href}
      prefetch={link.external ? undefined : false}
      className={className}
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
  const resolvedVariant =
    variant === 'auto'
      ? pathname && MINIMAL_FOOTER_PATHS.has(pathname)
        ? 'minimal'
        : 'expanded'
      : variant;
  const isMinimal = resolvedVariant === 'minimal';
  const pageOwnsFinalCta =
    typeof pathname === 'string' && PAGE_OWNS_FINAL_CTA_PATHS.has(pathname);
  const shouldShowCta = showCta && !isMinimal && !pageOwnsFinalCta;

  return (
    <footer
      className={cn('marketing-footer-premium', className)}
      data-testid='marketing-footer'
    >
      <div
        className={cn(
          'mx-auto w-full max-w-[var(--linear-content-max)] px-[clamp(1.25rem,2.2vw,2rem)]',
          isMinimal
            ? 'py-[clamp(2.6rem,5vw,4rem)]'
            : shouldShowCta
              ? 'pt-0 pb-[clamp(5rem,8vw,7rem)]'
              : 'pt-[clamp(3.25rem,5vw,4.6rem)] pb-[clamp(5rem,8vw,7rem)]'
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
          <div
            className={cn(
              'grid gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,2.6fr)] md:gap-x-16 md:gap-y-14 lg:gap-x-24',
              shouldShowCta && 'mt-[clamp(3.25rem,5vw,4.6rem)]'
            )}
          >
            <div className='min-w-0'>
              <Link
                href={APP_ROUTES.HOME}
                prefetch={false}
                aria-label='Jovie home'
                className={markLinkClassName}
              >
                <BrandLogo size={22} tone='white' rounded={false} aria-hidden />
              </Link>
              <p className='mf-mark-tagline'>
                Tools for artists to release music, capture fans, and earn
                without the platform tax.
              </p>
            </div>

            <nav
              className='grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4 lg:gap-x-12'
              aria-label='Footer'
            >
              {MARKETING_FOOTER_COLUMNS.map(column => (
                <section key={column.title}>
                  <h2 className='mf-eyebrow'>{column.title}</h2>
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
          <span className='text-[12px] leading-[1.45] tracking-[-0.005em] text-white/[0.36]'>
            © {new Date().getFullYear()} Jovie Technology Inc.
          </span>
          <nav aria-label='Legal' className='flex flex-wrap items-center gap-6'>
            {MARKETING_LEGAL_LINKS.map(link => (
              <FooterLink
                key={link.href}
                link={link}
                className={footerLegalLinkClassName}
              />
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
