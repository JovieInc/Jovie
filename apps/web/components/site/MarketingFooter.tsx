import Link from 'next/link';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { SUPPORT_EMAIL } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import { cn } from '@/lib/utils';

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
  {
    title: 'Connect',
    links: [
      { href: `mailto:${SUPPORT_EMAIL}`, label: 'Contact' },
      { href: 'https://instagram.com/meetjovie', label: 'Instagram' },
      { href: 'https://x.com/meetjovie', label: 'X' },
    ],
  },
] as const;

const footerLinkClassName =
  'inline-flex w-fit rounded-[5px] text-[13px] leading-[1.45] tracking-[-0.012em] text-white/[0.42] transition-colors duration-150 hover:text-white/90 focus-visible:text-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-black';
const footerLegalLinkClassName =
  'inline-flex w-fit rounded-[5px] text-[12px] leading-5 tracking-[-0.01em] text-white/[0.34] transition-colors duration-150 hover:text-white/70 focus-visible:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-black';

export function MarketingFooter({
  variant = 'auto',
  className,
}: Readonly<MarketingFooterProps>) {
  const isMinimal = variant === 'minimal';

  return (
    <footer
      className={cn(
        'relative overflow-hidden border-t border-white/[0.04] bg-[#020303] text-white',
        className
      )}
    >
      <div
        className={cn(
          'relative mx-auto w-full max-w-[1180px] px-6 sm:px-8 xl:px-0',
          isMinimal
            ? 'py-[clamp(2.6rem,5vw,4rem)]'
            : 'pt-[clamp(3.25rem,5vw,4.6rem)] pb-[clamp(7.25rem,12vw,10.5rem)]'
        )}
      >
        <div className='grid gap-12 md:grid-cols-[3.5rem_minmax(0,1fr)] md:gap-14 xl:gap-16'>
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
            {FOOTER_COLUMNS.map(column => (
              <section key={column.title}>
                <h2 className='mb-4 text-[12px] font-medium leading-[1.35] tracking-[-0.01em] text-white/[0.78]'>
                  {column.title}
                </h2>
                <ul className='flex list-none flex-col gap-2.5 p-0'>
                  {column.links.map(link => (
                    <li key={`${link.href}-${link.label}`}>
                      <Link
                        href={link.href}
                        prefetch={false}
                        className={footerLinkClassName}
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

        <div
          className={cn(
            'flex flex-wrap items-center gap-x-7 gap-y-2 text-[12px] leading-5 tracking-[-0.01em] text-white/[0.32]',
            isMinimal ? 'mt-8' : 'mt-[clamp(4.7rem,8vw,7.25rem)]'
          )}
        >
          <span>© {new Date().getFullYear()} Jovie Technology Inc.</span>
          <nav aria-label='Legal' className='flex flex-wrap items-center gap-4'>
            <Link
              href={APP_ROUTES.LEGAL_PRIVACY}
              prefetch={false}
              className={footerLegalLinkClassName}
            >
              Privacy
            </Link>
            <Link
              href={APP_ROUTES.LEGAL_TERMS}
              prefetch={false}
              className={footerLegalLinkClassName}
            >
              Terms
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
