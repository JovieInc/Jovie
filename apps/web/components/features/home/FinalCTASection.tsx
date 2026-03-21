'use client';

import { Container } from '@/components/site/Container';
import { ClaimHandleForm } from './claim-handle';

export function FinalCTASection() {
  return (
    <section
      className='relative z-10 overflow-hidden'
      style={{
        borderTop: '1px solid var(--linear-border-subtle)',
        paddingTop: 'calc(var(--linear-cta-section-pt) - 1.5rem)',
        paddingBottom: 'calc(var(--linear-cta-section-pb) - 2rem)',
      }}
    >
      <Container size='homepage'>
        <div className='reveal-on-scroll relative mx-auto flex max-w-[38rem] flex-col items-center text-center'>
          <h2
            data-testid='final-cta-headline'
            className='marketing-h2-linear max-w-[8.5ch] text-primary-token'
          >
            Take the stage.
          </h2>

          <p className='mt-4 max-w-[31rem] marketing-lead-linear text-secondary-token'>
            Claim your handle and get the release system ready before the next
            song drops.
          </p>

          {/* Form */}
          <div className='mt-6 w-full max-w-[34rem] md:mt-7'>
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

          {/* Trust signals */}
          <div className='mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2'>
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
