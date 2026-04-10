'use client';

import { Button } from '@jovie/ui';
import { useEffect } from 'react';
import { MarketingContainer } from '@/components/marketing';
import { DOCS_URL, SUPPORT_EMAIL } from '@/constants/domains';
import { page, track } from '@/lib/analytics';

const CHANNELS = [
  {
    title: 'Documentation',
    description: 'Guides, tutorials, and walkthroughs.',
    href: DOCS_URL,
    external: true,
    event: 'Support Docs Clicked',
  },
  {
    title: 'Email Support',
    description: 'Reach our team directly.',
    href: `mailto:${SUPPORT_EMAIL}`,
    external: false,
    event: 'Support Email Clicked',
  },
  {
    title: 'Getting Started',
    description: 'New to Jovie? Start here.',
    href: `${DOCS_URL}/getting-started`,
    external: true,
    event: 'Support Getting Started Clicked',
  },
] as const;

export function SupportChannels() {
  useEffect(() => {
    page('Support Page', {
      path: '/support',
    });
  }, []);

  return (
    <MarketingContainer width='prose' className='pb-16'>
      <section>
        <h2 className='text-2xl font-semibold text-primary-token'>
          How can we help?
        </h2>
        <div className='mt-6 grid gap-8 sm:grid-cols-3'>
          {CHANNELS.map(channel => (
            <div key={channel.title}>
              <h3 className='font-medium text-primary-token'>
                {channel.title}
              </h3>
              <p className='mt-2 text-sm leading-relaxed text-secondary-token'>
                {channel.description}
              </p>
              <Button
                asChild
                variant='ghost'
                size='sm'
                className='mt-3 px-0'
                onClick={() => track(channel.event, { source: 'support_page' })}
              >
                <a
                  href={channel.href}
                  className='public-action-inline'
                  {...(channel.external
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : {})}
                >
                  {channel.external ? 'Visit' : 'Send email'} &rarr;
                </a>
              </Button>
            </div>
          ))}
        </div>
      </section>
    </MarketingContainer>
  );
}

export function SupportCta() {
  return (
    <MarketingContainer width='prose' className='pb-24'>
      <section>
        <h2 className='text-2xl font-semibold text-primary-token'>
          Still need help?
        </h2>
        <p className='mt-4 text-base leading-relaxed text-secondary-token'>
          Our team is happy to help with anything not covered in the docs.
        </p>
        <Button
          asChild
          className='mt-6'
          aria-label={`Send email to support team at ${SUPPORT_EMAIL}`}
          onClick={() =>
            track('Support Email Clicked', {
              email: SUPPORT_EMAIL,
              source: 'support_page_cta',
            })
          }
        >
          <a href={`mailto:${SUPPORT_EMAIL}`} className='public-action-primary'>
            Contact Support
          </a>
        </Button>
      </section>
    </MarketingContainer>
  );
}
