'use client';

import { Container } from '@/components/site/Container';
import { ClaimHandleForm } from './claim-handle';

export function FinalCTASection() {
  return (
    <section className='bg-[var(--linear-bg-page)] relative z-10 pt-[var(--linear-section-pt-lg)] pb-24'>
      <Container size='homepage'>
        {/* Gradient separator */}
        <div
          aria-hidden='true'
          className='mb-12 h-px max-w-[var(--linear-container-max)] mx-auto'
          style={{
            background:
              'linear-gradient(to right, transparent, var(--linear-separator-via), transparent)',
          }}
        />

        <div className='mx-auto flex max-w-2xl flex-col items-center text-center'>
          <h2
            data-testid='final-cta-headline'
            className='marketing-h2-linear text-[var(--linear-text-primary)]'
          >
            Your fans are visiting. Convert them.
          </h2>
          <p
            data-testid='final-cta-subtext'
            className='mt-4 marketing-lead-linear text-[var(--linear-text-secondary)]'
          >
            Free forever. No credit card required.
          </p>

          {/* Docking zone — matches FloatingClaimBar dimensions/style */}
          <div className='mt-8 w-full flex justify-center'>
            <div
              id='final-cta-dock'
              data-testid='final-cta-dock'
              className='w-full max-w-[600px] overflow-hidden rounded-[24px] border border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-0)] p-2'
              style={{
                boxShadow:
                  '0 0 0 1px var(--linear-border-subtle), var(--linear-shadow-card-elevated)',
              }}
            >
              <ClaimHandleForm />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
