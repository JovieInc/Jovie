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
        <div className='reveal-on-scroll relative grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start'>
          <div className='max-w-[32rem]'>
            <p className='marketing-kicker'>Start free</p>
            <h2
              data-testid='final-cta-headline'
              className='marketing-h2-linear mt-6 text-primary-token'
            >
              Available today.
            </h2>

            <p className='mt-4 max-w-[30rem] marketing-lead-linear text-secondary-token'>
              Claim your handle and get your release system ready before the
              next song drops.
            </p>

            <div className='mt-5 flex flex-col items-start gap-2 text-left text-[length:var(--linear-label-size)] text-tertiary-token'>
              <p className='flex items-center gap-2'>
                <span
                  aria-hidden='true'
                  className='inline-block h-1.5 w-1.5 rounded-full bg-[var(--linear-success)]'
                />
                Live in minutes
              </p>
              <p>No credit card required</p>
            </div>
          </div>

          <div className='w-full max-w-[34rem] lg:justify-self-end'>
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
        </div>
      </MarketingContainer>
    </section>
  );
}
