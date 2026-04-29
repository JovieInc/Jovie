'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { APP_ROUTES } from '@/constants/routes';
import { cn } from '@/lib/utils';

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

interface MarketingFooterProps {
  readonly variant?: 'auto' | 'expanded' | 'minimal';
  readonly className?: string;
}

const FOOTER_COLUMNS: readonly {
  readonly title: string;
  readonly links: readonly {
    readonly href: string;
    readonly label: string;
  }[];
}[] = [
  {
    title: 'Product',
    links: [
      { href: APP_ROUTES.ARTIST_PROFILES, label: 'Artist Profiles' },
      { href: APP_ROUTES.SIGNUP, label: 'Release Planning' },
      { href: APP_ROUTES.PRICING, label: 'Pricing' },
    ],
  },
  {
    title: 'Features',
    links: [
      { href: APP_ROUTES.ARTIST_PROFILES, label: 'Smart Links' },
      { href: APP_ROUTES.ARTIST_NOTIFICATIONS, label: 'Notifications' },
      { href: APP_ROUTES.SIGNUP, label: 'Audience Signal' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: APP_ROUTES.ABOUT, label: 'About' },
      { href: APP_ROUTES.BLOG, label: 'Blog' },
      { href: APP_ROUTES.CHANGELOG, label: 'Changelog' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { href: APP_ROUTES.SUPPORT, label: 'Support' },
      { href: 'https://status.jov.ie', label: 'Status' },
      { href: APP_ROUTES.DEMO, label: 'Demo' },
    ],
  },
] as const;

const markLinkClassName =
  '-m-1.5 inline-flex rounded-full p-1.5 text-white/[0.92] transition-opacity duration-150 hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-black';

export function MarketingFooter({
  variant = 'auto',
  className,
}: Readonly<MarketingFooterProps>) {
  const pathname = usePathname();
  const resolvedVariant =
    variant === 'auto'
      ? pathname && MINIMAL_FOOTER_PATHS.has(pathname)
        ? 'minimal'
        : 'expanded'
      : variant;
  const isMinimal = resolvedVariant === 'minimal';

  return (
    <footer
      className={cn('marketing-footer-premium', className)}
      data-testid='marketing-footer'
    >
      <div
        className={cn(
          'mx-auto w-full max-w-[var(--linear-content-max)] px-[clamp(1.25rem,2.2vw,2rem)]',
          isMinimal
            ? 'pt-[clamp(2.5rem,4.5vw,3.5rem)] pb-[clamp(2rem,3.5vw,2.75rem)]'
            : 'pt-[clamp(3.5rem,5.5vw,5rem)] pb-[clamp(2rem,3.5vw,2.75rem)]'
        )}
      >
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
              <p className='mf-mark-tagline'>
                Tools for artists to release music, capture fans, and earn
                without the platform tax.
              </p>
            </div>

            <nav
              className='grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4 lg:gap-x-12'
              aria-label='Footer'
            >
              {FOOTER_COLUMNS.map(column => (
                <section key={column.title}>
                  <h2 className='mf-eyebrow mf-eyebrow--caps'>
                    {column.title}
                  </h2>
                  <ul className='flex list-none flex-col gap-3 p-0'>
                    {column.links.map(link => (
                      <li key={`${link.href}-${link.label}`}>
                        <Link
                          href={link.href}
                          prefetch={false}
                          className='mf-link'
                        >
                          {link.label}
                        </Link>
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
            <Link
              href={APP_ROUTES.LEGAL_PRIVACY}
              prefetch={false}
              className='mf-legal-link'
            >
              Privacy
            </Link>
            <Link
              href={APP_ROUTES.LEGAL_TERMS}
              prefetch={false}
              className='mf-legal-link'
            >
              Terms
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
