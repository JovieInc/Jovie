'use client';

import { Container } from '@/components/site/Container';
import { ClaimHandleForm } from './claim-handle';

export function FinalCTASection() {
  return (
    <section className='bg-[var(--linear-bg-page)] relative z-10 pt-[var(--linear-section-pt-md)] pb-32'>
      {/* Ambient glow behind CTA — larger, more diffuse */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2'
        style={{
          width: '700px',
          height: '500px',
          borderRadius: '50%',
          background:
            'radial-gradient(ellipse at center, oklch(18% 0.015 260 / 0.2), transparent 60%)',
        }}
      />

      <Container size='homepage'>
        <div className='relative mx-auto flex max-w-2xl flex-col items-center text-center'>
          <h2
            data-testid='final-cta-headline'
            className='marketing-h2-linear text-[var(--linear-text-primary)]'
          >
            Your fans are visiting. Convert them.
          </h2>
          <p
            data-testid='final-cta-subtext'
            className='mt-5 marketing-lead-linear text-[var(--linear-text-tertiary)]'
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
                border: '1px solid var(--linear-border-default)',
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

          {/* Trust signal below CTA */}
          <p
            className='mt-6 flex items-center justify-center gap-2'
            style={{
              fontSize: '12px',
              fontWeight: 450,
              letterSpacing: '0.01em',
              color: 'var(--linear-text-tertiary)',
            }}
          >
            <span
              aria-hidden='true'
              className='inline-block h-1.5 w-1.5 rounded-full bg-[var(--linear-success)] shadow-[0_0_6px_var(--linear-success)]'
            />{' '}
            Live in 60 seconds
          </p>
        </div>
      </Container>
    </section>
  );
}
