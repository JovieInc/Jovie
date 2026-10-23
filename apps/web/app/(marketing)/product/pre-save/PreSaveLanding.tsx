import Link from 'next/link';
import { MarketingPageShell } from '@/components/marketing';
import { PRE_SAVE_COPY } from '@/data/preSaveCopy';
import { PreSaveCountdown } from './PreSaveCountdown';
import './PreSaveLanding.css';

export function PreSaveLanding() {
  const { headline, support, links } = PRE_SAVE_COPY;

  return (
    <MarketingPageShell className='bg-base text-primary-token'>
      <section
        aria-labelledby='pre-save-title'
        className='pre-save-stage relative flex flex-col overflow-hidden'
        data-accent='ion'
        data-testid='marketing-section-hero'
        data-marketing-variant='split-screenshot-right'
        data-marketing-owner='apps/web/app/(marketing)/product/pre-save/PreSaveLanding.tsx'
      >
        <div
          aria-hidden='true'
          className='hero-glow pre-save-glow pointer-events-none absolute inset-x-0 top-0'
        />
        <div className='relative w-full max-w-3xl px-6 pt-16 sm:px-10 sm:pt-24'>
          <h1
            id='pre-save-title'
            data-wrap='editorial-title'
            className='pre-save-title text-balance font-display text-2xl font-medium tracking-tight text-primary-token'
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
            data-testid='pre-save-panel'
            className='pre-save-card w-full rounded-3xl border border-subtle bg-surface-1 px-5 pt-6 sm:px-6'
          >
            <PreSaveCountdown />
          </div>
        </div>
      </section>
    </MarketingPageShell>
  );
}
