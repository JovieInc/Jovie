import type { LucideIcon } from 'lucide-react';
import { BarChart3, Bell, Link2, Megaphone } from 'lucide-react';
import Link from 'next/link';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { APP_ROUTES } from '@/constants/routes';

const FOOTER_FEATURES: readonly {
  readonly title: string;
  readonly Icon: LucideIcon;
  readonly accent: 'blue' | 'teal' | 'green' | 'purple';
}[] = [
  { title: 'Profiles', Icon: Link2, accent: 'blue' },
  { title: 'Releases', Icon: Megaphone, accent: 'teal' },
  { title: 'Audience', Icon: BarChart3, accent: 'green' },
  { title: 'Follow-Up', Icon: Bell, accent: 'purple' },
] as const;

const FOOTER_COLUMNS: readonly {
  readonly title: string;
  readonly accent: 'blue' | 'teal' | 'purple' | 'pink';
  readonly links: readonly {
    readonly href: string;
    readonly label: string;
  }[];
}[] = [
  {
    title: 'Product',
    accent: 'blue',
    links: [
      { href: APP_ROUTES.ARTIST_PROFILES, label: 'Artist Profiles' },
      { href: APP_ROUTES.ARTIST_NOTIFICATIONS, label: 'Notifications' },
      { href: APP_ROUTES.PRICING, label: 'Pricing' },
    ],
  },
  {
    title: 'Resources',
    accent: 'teal',
    links: [
      { href: APP_ROUTES.BLOG, label: 'Blog' },
      { href: APP_ROUTES.SUPPORT, label: 'Support' },
      { href: 'https://status.jov.ie', label: 'Status' },
    ],
  },
  {
    title: 'Account',
    accent: 'purple',
    links: [
      { href: APP_ROUTES.SIGNIN, label: 'Log in' },
      { href: APP_ROUTES.SIGNUP, label: 'Start Free Trial' },
    ],
  },
  {
    title: 'Legal',
    accent: 'pink',
    links: [
      { href: APP_ROUTES.LEGAL_PRIVACY, label: 'Privacy' },
      { href: APP_ROUTES.LEGAL_TERMS, label: 'Terms' },
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
            aria-labelledby='homepage-footer-heading'
          >
            <Link
              href={APP_ROUTES.HOME}
              prefetch={false}
              aria-label='Jovie home'
              className='homepage-expanded-footer__symbol focus-ring-themed'
            >
              <BrandLogo size={56} tone='white' aria-hidden />
            </Link>
            <h2
              id='homepage-footer-heading'
              className='homepage-expanded-footer__heading'
            >
              Built For The Next Drop.
            </h2>
            <p className='homepage-expanded-footer__copy'>
              One quiet workspace for release planning, profile links, audience
              signal, and follow-up.
            </p>
            <div className='homepage-expanded-footer__actions'>
              <Link
                href={APP_ROUTES.SIGNUP}
                className='public-action-primary focus-ring-themed'
              >
                Start Free Trial
              </Link>
              <Link
                href={APP_ROUTES.ARTIST_PROFILES}
                className='public-action-secondary focus-ring-themed'
              >
                Explore Profiles
              </Link>
            </div>
          </section>

          <div className='homepage-expanded-footer__right'>
            <div className='homepage-expanded-footer__feature-row'>
              {FOOTER_FEATURES.map(({ title, Icon, accent }) => (
                <div
                  className='homepage-expanded-footer__feature'
                  data-accent={accent}
                  key={title}
                >
                  <Icon aria-hidden className='h-4 w-4' strokeWidth={1.85} />
                  <span>{title}</span>
                </div>
              ))}
            </div>

            <nav className='homepage-expanded-footer__nav' aria-label='Footer'>
              {FOOTER_COLUMNS.map(column => (
                <section key={column.title}>
                  <h3
                    className='homepage-expanded-footer__nav-heading'
                    data-accent={column.accent}
                  >
                    {column.title}
                  </h3>
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
        </div>

        <div className='homepage-expanded-footer__bottom'>
          <span>© {new Date().getFullYear()} Jovie Technology Inc.</span>
          <span>jov.ie</span>
        </div>
      </div>
    </footer>
  );
}
