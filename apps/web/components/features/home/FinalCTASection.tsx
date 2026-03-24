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
            <h2
              data-testid='final-cta-headline'
              className='marketing-h2-linear text-primary-token'
            >
              More music, less marketing.
            </h2>

            <p className='marketing-lead-linear mt-4 max-w-[30rem] text-secondary-token'>
              Claim your handle. Your next release does the rest.
            </p>
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
