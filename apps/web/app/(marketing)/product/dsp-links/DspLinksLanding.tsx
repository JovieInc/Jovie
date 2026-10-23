import Link from 'next/link';
import { MarketingPageShell } from '@/components/marketing';
import { DSP_LINKS_COPY } from '@/data/dspLinksCopy';
import { DspLinksList } from './DspLinksList';
import './DspLinksLanding.css';

export function DspLinksLanding() {
  const { headline, support, links } = DSP_LINKS_COPY;

  return (
    <MarketingPageShell className='bg-base text-primary-token'>
      <section
        aria-labelledby='dsp-links-title'
        className='dsp-links-stage relative flex flex-col overflow-hidden'
        data-accent='ion'
        data-testid='marketing-section-hero'
        data-marketing-variant='split-screenshot-right'
        data-marketing-owner='apps/web/app/(marketing)/product/dsp-links/DspLinksLanding.tsx'
      >
        <div
          aria-hidden='true'
          className='hero-glow dsp-links-glow pointer-events-none absolute inset-x-0 top-0'
        />
        <div className='relative w-full max-w-3xl px-6 pt-16 sm:px-10 sm:pt-24'>
          <h1
            id='dsp-links-title'
            data-wrap='editorial-title'
            className='dsp-links-title text-balance font-display text-2xl font-medium tracking-tight text-primary-token'
          >
            {headline}
          </h1>
          <p className='mt-4 max-w-xl text-base leading-7 text-secondary-token'>
            {support}
          </p>
          <div className='mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm'>
            {links.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className='text-secondary-token'
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className='relative mt-16 flex w-full max-w-xl flex-1 items-end px-6 sm:px-10'>
          <div
            data-testid='dsp-links-panel'
            className='dsp-links-card w-full rounded-3xl border border-subtle bg-surface-1 px-5 pt-6 sm:px-6'
          >
            <DspLinksList />
          </div>
        </div>
      </section>
    </MarketingPageShell>
  );
}
