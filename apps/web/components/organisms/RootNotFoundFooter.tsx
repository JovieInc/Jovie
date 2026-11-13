import '@/components/site/MarketingFooter.css';
import Link from 'next/link';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { MarketingFooterCta } from '@/components/site/MarketingFooterCta';
import { APP_ROUTES } from '@/constants/routes';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import {
  MARKETING_FOOTER_COLUMNS,
  MARKETING_LEGAL_LINKS,
  type MarketingFooterLink,
} from '@/data/marketingNavigation';
import {
  PRIVACY_CHOICES_HREF,
  PRIVACY_CHOICES_LABEL,
} from '@/lib/cookies/consent-state';

/**
 * Server-rendered twin of `<MarketingFooter />` as it draws on a path it does
 * not recognise: the expanded footer with the closing CTA, the code-default
 * columns and the legal row. The theme controls are left out; they only mount
 * on theme routes and the 404 is always dark.
 *
 * `MarketingFooter` is a client component (it reads the pathname), and the
 * root `app/not-found.tsx` is part of every route's initial load, so the 404
 * cannot render it without shipping its client graph everywhere. Keep this
 * file free of `'use client'` and of client-only imports.
 *
 * - `root-not-found-chrome-parity.test.tsx` holds this markup equal to
 *   `MarketingFooter`; change both together.
 * - `root-not-found-client-graph.test.ts` fails if a heavy client module
 *   becomes reachable from the root 404.
 */

const footerLinkClassName =
  'mf-link inline-flex w-fit whitespace-nowrap rounded-md text-mid leading-[1.45] tracking-[-0.005em] transition-colors duration-subtle';
const footerLegalLinkClassName =
  'mf-legal-link inline-flex w-fit rounded-md text-xs leading-5 tracking-tight transition-colors duration-subtle';

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

export function RootNotFoundFooter() {
  return (
    <footer
      data-pen-contract={MARKETING_PEN_CONTRACT_IDS.shell.footer}
      className='marketing-footer-premium'
      data-testid='marketing-footer'
      data-footer-variant='expanded'
    >
      <div className='public-container pt-0 pb-[clamp(2.5rem,4vw,3.5rem)]'>
        <MarketingFooterCta />

        <div className='grid gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,2.6fr)] md:gap-x-16 md:gap-y-14 lg:gap-x-24'>
          <div className='min-w-0'>
            <Link
              href={APP_ROUTES.HOME}
              prefetch={false}
              aria-label='Jovie Home'
              className='mf-logo-link -m-1.5 inline-flex rounded-full p-1.5 transition-opacity duration-subtle hover:opacity-75'
            >
              <BrandLogo
                size='chrome'
                tone='auto'
                rounded={false}
                aria-hidden
              />
            </Link>
          </div>

          <nav
            className='grid gap-x-8 gap-y-10 lg:gap-x-12 xl:gap-x-16 grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 mt-[clamp(3.25rem,5vw,4.6rem)]'
            aria-label='Footer'
          >
            {MARKETING_FOOTER_COLUMNS.map((column, index) => {
              const columnLabelId = `footer-column-${index}`;
              return (
                <section key={column.title} aria-labelledby={columnLabelId}>
                  <p id={columnLabelId} className='mf-eyebrow'>
                    {column.title}
                  </p>
                  <ul className='flex list-none flex-col gap-3 p-0'>
                    {column.links.map(link => (
                      <li key={`${link.href}-${link.label}`}>
                        <FooterLink link={link} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </nav>
        </div>

        <div className='mf-baseband flex flex-wrap items-center justify-between gap-x-7 gap-y-2'>
          <span className='mf-copyright'>
            {/* copy-allow: legal entity line, owned by code */}©{' '}
            {new Date().getFullYear()} Jovie Technology Inc.
          </span>
          <div className='mf-baseband__meta'>
            <nav
              aria-label='Legal'
              className='flex flex-wrap items-center gap-6'
            >
              <Link
                href={PRIVACY_CHOICES_HREF}
                prefetch={false}
                className={footerLegalLinkClassName}
              >
                {PRIVACY_CHOICES_LABEL}
              </Link>
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
      </div>
    </footer>
  );
}
