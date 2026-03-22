'use client';

import { MarketingContainer } from '@/components/marketing';
import { ClaimHandleForm } from './claim-handle';

export function FinalCTASection() {
  return (
    <section
      className='relative z-10 overflow-hidden'
      style={{
        borderTop: '1px solid var(--linear-border-subtle)',
        paddingTop: 'var(--linear-cta-section-pt)',
        paddingBottom: 'var(--linear-cta-section-pb)',
      }}
    >
      <MarketingContainer width='landing'>
        <div className='reveal-on-scroll relative mx-auto flex max-w-[42rem] flex-col items-center text-center'>
          <h2
            data-testid='final-cta-headline'
            className='marketing-h2-linear text-primary-token'
          >
            Start free. Available today.
          </h2>

          <p className='mt-3.5 max-w-[32rem] marketing-lead-linear text-secondary-token'>
            Claim your handle and get your release system ready before the next
            song drops.
          </p>

          <div className='mt-5 w-full max-w-[32rem] md:mt-6'>
            <div
              id='final-cta-dock'
              data-testid='final-cta-dock'
              className='homepage-surface-card relative w-full overflow-hidden rounded-[1rem] p-2'
              style={{
                borderColor: 'var(--linear-border-default)',
              }}
            >
              <ClaimHandleForm />
            </div>
          </div>

          <div className='mt-4 flex flex-col items-center justify-center gap-2 text-center sm:flex-row sm:flex-wrap sm:gap-x-4 sm:gap-y-2'>
            <p className='flex items-center gap-2 text-[length:var(--linear-label-size)] text-tertiary-token'>
              <span
                aria-hidden='true'
                className='inline-block h-1.5 w-1.5 rounded-full bg-[var(--linear-success)]'
              />
              Live in minutes
            </p>
            <span
              aria-hidden='true'
              className='hidden text-quaternary-token sm:inline'
            >
              ·
            </span>
            <p className='text-[length:var(--linear-label-size)] text-tertiary-token'>
              No credit card required
            </p>
          </div>
        </div>
      </MarketingContainer>
    </section>
  );
}
