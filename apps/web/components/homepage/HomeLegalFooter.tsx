import Link from 'next/link';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { SUPPORT_EMAIL } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';

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
      { href: APP_ROUTES.ARTIST_PROFILES, label: 'Profiles' },
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

export function HomeLegalFooter() {
  return (
    <footer className='homepage-expanded-footer'>
      <div className='homepage-expanded-footer__inner'>
        <div className='homepage-expanded-footer__top'>
          <section
            className='homepage-expanded-footer__brand'
            aria-label='Jovie'
          >
            <Link
              href={APP_ROUTES.HOME}
              prefetch={false}
              aria-label='Jovie home'
              className='homepage-expanded-footer__symbol focus-ring-themed'
            >
              <BrandLogo size={22} tone='white' aria-hidden />
            </Link>
          </section>

          <nav className='homepage-expanded-footer__nav' aria-label='Footer'>
            {FOOTER_COLUMNS.map(column => (
              <section key={column.title}>
                <h2 className='homepage-expanded-footer__nav-heading'>
                  {column.title}
                </h2>
                <ul className='homepage-expanded-footer__nav-list'>
                  {column.links.map(link => (
                    <li key={`${link.href}-${link.label}`}>
                      <Link
                        href={link.href}
                        prefetch={false}
                        className='homepage-expanded-footer__link focus-ring-themed'
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

        <div className='homepage-expanded-footer__bottom'>
          <span>© {new Date().getFullYear()} Jovie Technology Inc.</span>
          <div className='homepage-expanded-footer__legal-links'>
            <Link
              href={APP_ROUTES.LEGAL_PRIVACY}
              prefetch={false}
              className='homepage-expanded-footer__link focus-ring-themed'
            >
              Privacy
            </Link>
            <Link
              href={APP_ROUTES.LEGAL_TERMS}
              prefetch={false}
              className='homepage-expanded-footer__link focus-ring-themed'
            >
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
