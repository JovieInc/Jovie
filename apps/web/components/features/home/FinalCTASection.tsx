'use client';

import { Container } from '@/components/site/Container';
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
      <Container size='homepage'>
        <div className='reveal-on-scroll relative mx-auto flex max-w-xl flex-col items-center text-center'>
          <h2
            data-testid='final-cta-headline'
            className='marketing-h2-linear text-primary-token'
          >
            Your fans are waiting.
          </h2>

          <p className='mt-5 max-w-md marketing-lead-linear text-secondary-token'>
            Claim your handle and launch your career today.
          </p>

          {/* Form */}
          <div className='mt-10 w-full'>
            <div
              id='final-cta-dock'
              data-testid='final-cta-dock'
              className='relative w-full overflow-hidden rounded-2xl p-2'
              style={{
                border: '1px solid var(--linear-border-default)',
                boxShadow: 'var(--linear-shadow-card)',
              }}
            >
              <ClaimHandleForm />
            </div>
          </div>

          {/* Trust signals */}
          <div className='mt-6 flex items-center justify-center gap-4'>
            <p className='flex items-center gap-2 text-[length:var(--linear-label-size)] font-[number:var(--linear-font-weight-normal)] text-tertiary-token'>
              <span
                aria-hidden='true'
                className='inline-block h-1.5 w-1.5 rounded-full bg-[var(--linear-success)] shadow-[0_0_6px_var(--linear-success)]'
              />{' '}
              Live in 60 seconds
            </p>
            <span aria-hidden='true' className='text-quaternary-token'>
              ·
            </span>
            <p className='text-[length:var(--linear-label-size)] font-[number:var(--linear-font-weight-normal)] text-tertiary-token'>
              No credit card required
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
