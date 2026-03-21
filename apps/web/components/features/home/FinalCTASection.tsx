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
        <div className='reveal-on-scroll relative mx-auto flex max-w-[40rem] flex-col items-center text-center'>
          <h2
            data-testid='final-cta-headline'
            className='marketing-h2-linear max-w-[9ch] text-primary-token'
          >
            Take the stage.
          </h2>

          <p className='mt-5 max-w-md marketing-lead-linear text-secondary-token'>
            Claim your handle and get the release system ready before the next
            song drops.
          </p>

          {/* Form */}
          <div className='mt-7 w-full'>
            <div
              id='final-cta-dock'
              data-testid='final-cta-dock'
              className='relative w-full overflow-hidden rounded-[0.95rem] p-2'
              style={{
                border: '1px solid var(--linear-border-default)',
                boxShadow: 'var(--linear-shadow-card)',
              }}
            >
              <ClaimHandleForm />
            </div>
          </div>

          {/* Trust signals */}
          <div className='mt-4 flex items-center justify-center gap-4'>
            <p className='flex items-center gap-2 text-[length:var(--linear-label-size)] font-[number:var(--linear-font-weight-normal)] text-tertiary-token'>
              <span
                aria-hidden='true'
                className='inline-block h-1.5 w-1.5 rounded-full bg-[var(--linear-success)]'
              />{' '}
              Live in minutes
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
