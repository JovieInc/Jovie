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

const footerLinkClassName =
  'inline-flex w-fit rounded-[5px] text-[15px] leading-[1.45] tracking-[-0.005em] text-white/[0.72] transition-colors duration-150 hover:text-white focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-black';
const footerLegalLinkClassName =
  'inline-flex w-fit rounded-[5px] text-[12px] leading-5 tracking-[-0.01em] text-white/[0.34] transition-colors duration-150 hover:text-white/70 focus-visible:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-black';

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
      className={cn(
        'relative overflow-hidden border-t border-white/[0.04] bg-black text-white',
        className
      )}
    >
      <div
        className={cn(
          'marketing-footer-inner relative w-full px-[clamp(1.25rem,2.2vw,2rem)]',
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
            className='-m-1.5 inline-flex rounded-full p-1.5 text-white/[0.9] transition-opacity duration-150 hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-black'
          >
            <BrandLogo size={24} tone='white' rounded={false} aria-hidden />
          </Link>
        ) : (
          <div
            className={cn(
              'grid gap-12 md:grid-cols-[3.5rem_minmax(0,1fr)] md:gap-14 xl:gap-16',
              shouldShowCta && 'mt-[clamp(3.25rem,5vw,4.6rem)]'
            )}
          >
            <div className='min-w-0'>
              <Link
                href={APP_ROUTES.HOME}
                prefetch={false}
                aria-label='Jovie home'
                className='-m-1.5 inline-flex rounded-full p-1.5 text-white/[0.9] transition-opacity duration-150 hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-black'
              >
                <BrandLogo size={24} tone='white' rounded={false} aria-hidden />
              </Link>
            </div>

            <nav
              className='grid grid-cols-2 gap-x-10 gap-y-8 sm:grid-cols-3 lg:grid-cols-5 lg:gap-x-12 xl:gap-x-16'
              aria-label='Footer'
            >
              {MARKETING_FOOTER_COLUMNS.map(column => (
                <section key={column.title}>
                  <h2 className='mb-4 text-[12px] font-medium leading-[1.35] tracking-[-0.01em] text-white/[0.78]'>
                    {column.title}
                  </h2>
                  <ul className='flex list-none flex-col gap-2.5 p-0'>
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
            'flex flex-wrap items-center justify-between gap-x-7 gap-y-2 text-[12px] leading-5 tracking-[-0.01em] text-white/[0.32]',
            isMinimal ? 'mt-8' : 'mt-[clamp(3.5rem,6vw,5rem)]'
          )}
        >
          <span>© {new Date().getFullYear()} Jovie Technology Inc.</span>
          <nav aria-label='Legal' className='flex flex-wrap items-center gap-5'>
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
