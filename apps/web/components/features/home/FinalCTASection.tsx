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
        <div className='reveal-on-scroll mx-auto max-w-[36rem] text-center'>
          <h2
            data-testid='final-cta-headline'
            className='marketing-h2-linear text-primary-token'
          >
            Claim your handle.
          </h2>

          <p className='marketing-lead-linear mt-4 text-secondary-token'>
            Your next release does the rest.
          </p>

          <div
            data-testid='final-cta-form'
            className='mx-auto mt-7 w-full max-w-[27rem]'
          >
            <ClaimHandleForm />
          </div>
        </div>
      </MarketingContainer>
    </section>
  );
}
