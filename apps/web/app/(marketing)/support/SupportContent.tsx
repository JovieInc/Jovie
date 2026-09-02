'use client';

import { Button, Card } from '@jovie/ui';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, BookOpen, Mail, Rocket } from 'lucide-react';
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
    cta: 'Visit',
    icon: BookOpen,
  },
  {
    title: 'Email Support',
    description: 'Reach our team directly.',
    href: `mailto:${SUPPORT_EMAIL}`,
    external: false,
    event: 'Support Email Clicked',
    cta: 'Send email',
    icon: Mail,
  },
  {
    title: 'Getting Started',
    description: 'New to Jovie? Start here.',
    href: `${DOCS_URL}/getting-started`,
    external: true,
    event: 'Support Getting Started Clicked',
    cta: 'Visit',
    icon: Rocket,
  },
] as const satisfies ReadonlyArray<{
  readonly title: string;
  readonly description: string;
  readonly href: string;
  readonly external: boolean;
  readonly event: string;
  readonly cta: string;
  readonly icon: LucideIcon;
}>;

export function SupportChannels() {
  useEffect(() => {
    page('Support Page', {
      path: '/support',
    });
  }, []);

  return (
    <MarketingContainer width='prose' className='pb-16'>
      <section>
        <h2 className='text-2xl font-semibold tracking-tight text-primary-token'>
          How Can We Help?
        </h2>
        <div className='mt-6 grid gap-6 sm:grid-cols-3'>
          {CHANNELS.map(channel => {
            const Icon = channel.icon;
            return (
              <Card asChild key={channel.title} className='p-6'>
                <article>
                  <Icon className='h-5 w-5 text-accent' aria-hidden='true' />
                  <h3 className='mt-4 font-medium text-primary-token'>
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
                    <a
                      href={channel.href}
                      {...(channel.external
                        ? { target: '_blank', rel: 'noopener noreferrer' }
                        : {})}
                    >
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
        <h2 className='text-2xl font-semibold tracking-tight text-primary-token'>
          Still Need Help?
        </h2>
        <p className='mt-4 text-base leading-relaxed text-secondary-token'>
          Our team is happy to help with anything not covered in the docs.
        </p>
        <Button
          asChild
          variant='secondary'
          size='marketing'
          className='mt-6'
          aria-label={`Send email to support team at ${SUPPORT_EMAIL}`}
          onClick={() =>
            track('Support Email Clicked', {
              email: SUPPORT_EMAIL,
              source: 'support_page_cta',
            })
          }
        >
          <a href={`mailto:${SUPPORT_EMAIL}`}>Contact Support</a>
        </Button>
      </section>
    </MarketingContainer>
  );
}
