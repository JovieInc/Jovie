'use client';

import { Container } from '@/components/site/Container';
import { ClaimHandleForm } from './claim-handle';

export function FinalCTASection() {
  return (
    <section className='bg-[var(--linear-bg-page)] relative z-10 pt-[var(--linear-section-pt-lg)] pb-48'>
      {/* Ambient glow behind CTA */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/3'
        style={{
          width: '500px',
          height: '400px',
          borderRadius: '50%',
          background:
            'radial-gradient(ellipse at center, oklch(20% 0.03 260 / 0.2), transparent 65%)',
        }}
      />

      <Container size='homepage'>
        {/* Gradient separator */}
        <div
          aria-hidden='true'
          className='mb-20 h-px max-w-lg mx-auto'
          style={{
            background:
              'linear-gradient(to right, transparent, var(--linear-separator-via), transparent)',
          }}
        />

        <div className='relative mx-auto flex max-w-2xl flex-col items-center text-center'>
          <h2
            data-testid='final-cta-headline'
            className='marketing-h2-linear text-[var(--linear-text-primary)]'
          >
            Your fans are visiting. Convert them.
          </h2>
          <p
            data-testid='final-cta-subtext'
            className='mt-5 marketing-lead-linear'
            style={{ color: 'var(--linear-text-quaternary)' }}
          >
            Free forever. No credit card required.
          </p>

          {/* Docking zone — matches FloatingClaimBar dimensions/style */}
          <div className='mt-10 w-full flex justify-center'>
            <div
              id='final-cta-dock'
              data-testid='final-cta-dock'
              className='relative w-full max-w-[560px] overflow-hidden rounded-2xl p-2'
              style={{
                backgroundColor: 'var(--linear-bg-surface-0)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: [
                  '0 0 0 1px rgba(255,255,255,0.04)',
                  '0 8px 40px rgba(0,0,0,0.4)',
                  '0 24px 80px rgba(0,0,0,0.25)',
                ].join(', '),
              }}
            >
              {/* Shine edge */}
              <div
                aria-hidden='true'
                className='pointer-events-none absolute inset-0 rounded-2xl'
                style={{ border: '1px solid rgba(255,255,255,0.04)' }}
              />
              <ClaimHandleForm />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
