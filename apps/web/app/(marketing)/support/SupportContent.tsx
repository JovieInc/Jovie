'use client';

import { Button } from '@jovie/ui';
import { ArrowRight } from 'lucide-react';
import { useEffect } from 'react';
import { MarketingContainer } from '@/components/marketing';
import { DOCS_URL, SUPPORT_EMAIL } from '@/constants/domains';
import { SUPPORT_PAGE_COPY } from '@/data/supportCopy';
import { page, track } from '@/lib/analytics';
import { trackHelpCenterEscalationLanding } from '@/lib/tracking/help-center-client';

const HELP_CENTER_URL = `${DOCS_URL}/docs`;
const CONTACT_URL = `${DOCS_URL}/contact`;

const CHANNELS = [
  {
    ...SUPPORT_PAGE_COPY.channels.helpCenter,
    href: HELP_CENTER_URL,
    event: 'Support Help Center Clicked',
  },
  {
    ...SUPPORT_PAGE_COPY.channels.contact,
    href: `${CONTACT_URL}?from=/support`,
    event: 'Support Contact Clicked',
  },
] as const;

/**
 * The two self-serve paths as one quiet list: title, one line, one action.
 * No icon tiles or cards (matte, near-monochrome canon).
 */
export function SupportChannels() {
  useEffect(() => {
    page('Support Page', {
      path: '/support',
    });
    trackHelpCenterEscalationLanding(window.location.search);
  }, []);

  return (
    <MarketingContainer width='prose' className='pb-16'>
      <section
        data-testid='marketing-section-content-prose'
        data-marketing-variant='article-body'
        data-marketing-owner='apps/web/app/(marketing)/support/SupportContent.tsx'
        aria-labelledby='support-channels-heading'
      >
        <h2
          id='support-channels-heading'
          className='text-2xl font-semibold tracking-tight text-primary-token text-balance line-clamp-2'
        >
          {SUPPORT_PAGE_COPY.channels.title}
        </h2>
        <ul className='mt-6 border-t border-subtle'>
          {CHANNELS.map(channel => (
            <li
              key={channel.title}
              className='flex flex-col gap-3 border-b border-subtle py-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8'
            >
              <div className='min-w-0'>
                <h3 className='text-base font-medium text-primary-token text-balance'>
                  {channel.title}
                </h3>
                <p className='mt-1 text-sm leading-relaxed text-secondary-token text-pretty'>
                  {channel.description}
                </p>
              </div>
              <Button
                asChild
                variant='ghost'
                size='marketing'
                className='shrink-0 gap-1.5 self-start max-sm:-ml-2.5 sm:-mr-2.5 sm:self-center'
                onClick={() => track(channel.event, { source: 'support_page' })}
              >
                <a href={channel.href}>
                  <span>{channel.cta}</span>
                  <ArrowRight className='h-3.5 w-3.5' aria-hidden='true' />
                </a>
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </MarketingContainer>
  );
}

/** Direct email fallback: a distinct path, not a repeat of the contact form. */
export function SupportCta() {
  return (
    <MarketingContainer width='prose' className='pb-24'>
      <section
        data-testid='marketing-section-cta'
        data-marketing-variant='final-single-claim'
        data-marketing-owner='apps/web/app/(marketing)/support/SupportContent.tsx'
        aria-labelledby='support-email-heading'
      >
        <h2
          id='support-email-heading'
          className='text-2xl font-semibold tracking-tight text-primary-token text-balance line-clamp-2'
        >
          {SUPPORT_PAGE_COPY.email.title}
        </h2>
        <p className='mt-4 text-base leading-relaxed text-secondary-token text-pretty'>
          {SUPPORT_PAGE_COPY.email.body}
        </p>
        <Button
          asChild
          variant='secondary'
          size='marketing'
          className='mt-6'
          onClick={() =>
            track('Support Email Clicked', {
              email: SUPPORT_EMAIL,
              source: 'support_page_cta',
            })
          }
        >
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </Button>
      </section>
    </MarketingContainer>
  );
}
