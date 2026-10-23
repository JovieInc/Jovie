import Link from 'next/link';
import { LinkAnalyticsPanel } from '@/components/features/link-analytics/LinkAnalyticsPanel';
import { MarketingPageShell } from '@/components/marketing/MarketingPageShell';
import { LINK_ANALYTICS_COPY } from '@/data/linkAnalyticsCopy';
import './LinkAnalyticsLanding.css';

export function LinkAnalyticsLanding() {
  const { headline, support, links } = LINK_ANALYTICS_COPY;

  return (
    <MarketingPageShell className='bg-base text-primary-token'>
      <section
        aria-labelledby='link-analytics-title'
        className='link-analytics-stage relative flex flex-col overflow-hidden'
        data-accent='ion'
        data-marketing-owner='apps/web/app/(marketing)/product/link-analytics/LinkAnalyticsLanding.tsx'
        data-marketing-variant='split-screenshot-right'
        data-testid='marketing-section-hero'
      >
        <div
          aria-hidden='true'
          className='hero-glow link-analytics-glow pointer-events-none absolute inset-x-0 top-0'
        />
        <div className='relative w-full max-w-3xl px-6 pt-16 sm:px-10 sm:pt-24'>
          <h1
            className='link-analytics-title font-display text-2xl font-medium tracking-tight text-primary-token'
            data-wrap='editorial-title'
            id='link-analytics-title'
          >
            {headline}
          </h1>
          <p className='mt-4 max-w-xl text-base leading-7 text-secondary-token'>
            {support}
          </p>
          <div className='mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm'>
            {links.map(link => (
              <Link
                className='text-secondary-token'
                href={link.href}
                key={link.href}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className='relative mt-16 flex w-full max-w-xl flex-1 items-end px-6 sm:px-10'>
          <div
            className='link-analytics-card w-full rounded-3xl border border-subtle bg-surface-1 px-5 pt-6 sm:px-6'
            data-testid='link-analytics-panel'
          >
            <LinkAnalyticsPanel />
          </div>
        </div>
      </section>
    </MarketingPageShell>
  );
}
