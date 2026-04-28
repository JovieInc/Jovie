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

export function MarketingFooter({ className }: Readonly<MarketingFooterProps>) {
  return (
    <footer
      className={cn(
        'relative overflow-hidden border-t border-white/[0.04] bg-[#020303] text-white',
        className
      )}
    >
      <div className='relative mx-auto w-full max-w-[1180px] px-5 py-[clamp(2.8rem,5vw,4.1rem)] pb-[clamp(5.7rem,10vw,8.4rem)] sm:px-6 lg:px-0'>
        <div className='grid gap-10 md:grid-cols-[4.5rem_minmax(0,1fr)] md:gap-12 xl:gap-16'>
          <div className='min-w-0'>
            <Link
              href={APP_ROUTES.HOME}
              prefetch={false}
              aria-label='Jovie home'
              className='-m-1.5 inline-flex rounded-full p-1.5 text-white/[0.92] transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-black'
            >
              <BrandLogo size={22} tone='white' aria-hidden />
            </Link>
          </div>

          <nav
            className='grid grid-cols-2 gap-x-9 gap-y-9 sm:grid-cols-3 md:grid-cols-5 md:gap-x-8 lg:gap-x-10 xl:gap-x-14'
            aria-label='Footer'
          >
            {FOOTER_COLUMNS.map(column => (
              <section key={column.title}>
                <h2 className='mb-5 text-[13px] font-medium leading-[1.3] tracking-[-0.012em] text-white/90'>
                  {column.title}
                </h2>
                <ul className='flex list-none flex-col gap-3 p-0'>
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

        <div className='mt-[clamp(3.8rem,7vw,6rem)] flex flex-wrap items-center gap-x-7 gap-y-2 text-[12px] leading-5 tracking-[-0.01em] text-white/[0.34]'>
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
