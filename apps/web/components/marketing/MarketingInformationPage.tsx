import { Button } from '@jovie/ui';
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import type { MarketingInformationPageDefinition } from '@/data/marketingInformationArchitecture';
import { MarketingContainer } from './MarketingContainer';
import { MarketingHero } from './MarketingHero';
import { MarketingPageShell } from './MarketingPageShell';
import { MarketingSectionHeading } from './MarketingSectionHeading';

export function MarketingInformationPage({
  page,
}: Readonly<{ page: MarketingInformationPageDefinition }>) {
  return (
    <MarketingPageShell>
      <MarketingHero
        headingId='marketing-information-heading'
        headline={page.headline}
        subtitle={page.description}
        primaryCta={{ label: 'Find Yourself', href: APP_ROUTES.START }}
        secondaryCta={{ label: 'See Pricing', href: APP_ROUTES.PRICING }}
        logos={false}
        align='left'
      />

      <MarketingContainer width='page'>
        <div className='border-y border-subtle py-5'>
          <p className='font-mono text-xs uppercase tracking-wide text-tertiary-token'>
            {page.eyebrow} · {page.status === 'live' ? 'Live' : 'Early access'}
          </p>
        </div>
        <div className='grid gap-0 pb-28 md:grid-cols-2'>
          {page.sections.map((section, index) => (
            <section
              key={section.heading}
              aria-labelledby={`marketing-information-section-${index}`}
              className='border-b border-subtle py-10 md:min-h-72 md:px-8 md:first:pl-0'
            >
              <p className='homepage-section-eyebrow'>
                {`${index + 1}`.padStart(2, '0')}
              </p>
              <MarketingSectionHeading
                id={`marketing-information-section-${index}`}
                className='mt-5 max-w-xl'
              >
                {section.heading}
              </MarketingSectionHeading>
              <p className='mt-5 max-w-xl text-base leading-relaxed text-secondary-token'>
                {section.body}
              </p>
              {section.links?.length ? (
                <div className='mt-7 flex flex-wrap gap-3'>
                  {section.links.map(link => (
                    <Button
                      key={link.href}
                      asChild
                      size='sm'
                      variant='secondary'
                    >
                      <Link href={link.href}>{link.label}</Link>
                    </Button>
                  ))}
                </div>
              ) : null}
            </section>
          ))}
        </div>
      </MarketingContainer>
    </MarketingPageShell>
  );
}
