'use client';

import { Container } from '@/components/site/Container';
import { ClaimHandleForm } from './claim-handle';

export function FinalCTASection() {
  return (
    <section
      className='bg-[var(--linear-bg-surface-1)] text-white relative z-10 pt-[var(--linear-section-pt-md)] pb-32'
      style={{ borderTop: '1px solid var(--linear-border-subtle)' }}
    >
      {/* Ambient glow behind CTA — larger, more diffuse */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2'
        style={{
          width: '700px',
          height: '500px',
          borderRadius: '50%',
          background:
            'radial-gradient(ellipse at center, oklch(35% 0.08 270 / 0.35), transparent 60%)',
        }}
      />

      <Container size='homepage'>
        <div className='reveal-on-scroll relative mx-auto flex max-w-2xl flex-col items-center text-center'>
          <h2
            data-testid='final-cta-headline'
            className='marketing-h2-linear text-white'
          >
            Give the next fan one clear place to go.
          </h2>
          <p className='mt-4 max-w-xl marketing-lead-linear text-[var(--linear-text-secondary)]'>
            Claim your handle, launch your page, and start collecting the
            audience data every other profile page leaves behind.
          </p>
          {/* Docking zone — matches FloatingClaimBar dimensions/style */}
          <div className='mt-10 w-full flex justify-center'>
            <div
              id='final-cta-dock'
              data-testid='final-cta-dock'
              className='relative w-full max-w-[560px] overflow-hidden rounded-2xl p-2'
              style={{
                backgroundColor: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.10)',
                boxShadow:
                  '0 8px 40px rgba(0,0,0,0.4), 0 24px 80px rgba(0,0,0,0.25)',
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
              color: 'rgba(255,255,255,0.5)',
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
