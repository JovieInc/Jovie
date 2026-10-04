'use client';

import { Button, Card } from '@jovie/ui';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, BookOpen, LifeBuoy } from 'lucide-react';
import { useEffect } from 'react';
import { MarketingContainer } from '@/components/marketing';
import { DOCS_URL, SUPPORT_EMAIL } from '@/constants/domains';
import { page, track } from '@/lib/analytics';
import { trackHelpCenterEscalationLanding } from '@/lib/tracking/help-center-client';

const HELP_CENTER_URL = `${DOCS_URL}/docs`;
const CONTACT_URL = `${DOCS_URL}/contact`;

const CHANNELS = [
  {
    title: 'Help Center',
    description: 'Guides, troubleshooting, and walkthroughs.',
    href: HELP_CENTER_URL,
    event: 'Support Help Center Clicked',
    cta: 'Browse the Help Center',
    icon: BookOpen,
  },
  {
    title: 'Contact Support',
    description:
      'Email our team with the page and search context already attached.',
    href: `${CONTACT_URL}?from=/support`,
    event: 'Support Contact Clicked',
    cta: 'Contact support',
    icon: LifeBuoy,
  },
] as const satisfies ReadonlyArray<{
  readonly title: string;
  readonly description: string;
  readonly href: string;
  readonly event: string;
  readonly cta: string;
  readonly icon: LucideIcon;
}>;

export function SupportChannels() {
  useEffect(() => {
    page('Support Page', {
      path: '/support',
    });
    trackHelpCenterEscalationLanding(window.location.search);
  }, []);

  return (
    <MarketingContainer width='prose' className='pb-16'>
      <section>
        <h2 className='text-2xl font-semibold tracking-tight text-primary-token line-clamp-2'>
          How Can We Help?
        </h2>
        <div className='mt-6 grid gap-6 sm:grid-cols-2'>
          {CHANNELS.map(channel => {
            const Icon = channel.icon;
            return (
              <Card asChild key={channel.title} className='p-6'>
                <article>
                  <Icon className='h-5 w-5 text-accent' aria-hidden='true' />
                  <h3 className='mt-4 text-base font-medium text-primary-token'>
                    {channel.title}
                  </h3>
                  <p className='mt-2 text-sm leading-relaxed text-secondary-token'>
                    {channel.description}
                  </p>
                  <Button
                    asChild
                    variant='ghost'
                    size='marketing'
                    className='mt-3 gap-1.5'
                    onClick={() =>
                      track(channel.event, { source: 'support_page' })
                    }
                  >
                    <a href={channel.href}>
                      <span>{channel.cta}</span>
                      <ArrowRight className='h-3.5 w-3.5' aria-hidden='true' />
                    </a>
                  </Button>
                </article>
              </Card>
            );
          })}
        </div>
      </section>
    </MarketingContainer>
  );
}

export function SupportCta() {
  return (
    <MarketingContainer width='prose' className='pb-24'>
      <section data-testid='support-cta'>
        <h2 className='text-2xl font-semibold tracking-tight text-primary-token line-clamp-2'>
          Still Need Help?
        </h2>
        <p className='mt-4 text-base leading-relaxed text-secondary-token'>
          If the Help Center did not solve it, contact our team directly.
        </p>
        <Button
          asChild
          variant='secondary'
          size='marketing'
          className='mt-6'
          aria-label='Contact Support With Page Context Attached'
          onClick={() =>
            track('Support Contact Clicked', {
              source: 'support_page_cta',
            })
          }
        >
          <a href={`${CONTACT_URL}?from=/support`}>Contact Support</a>
        </Button>
        <p className='mt-4 text-sm leading-relaxed text-secondary-token'>
          You can also email{' '}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className='text-primary-token underline'
            onClick={() =>
              track('Support Email Clicked', {
                email: SUPPORT_EMAIL,
                source: 'support_page_cta',
              })
            }
          >
            {SUPPORT_EMAIL}
          </a>{' '}
          directly.
        </p>
      </section>
    </MarketingContainer>
  );
}
