'use client';

import { Container } from '@/components/site/Container';
import { ClaimHandleForm } from './claim-handle';

export function FinalCTASection() {
  return (
    <section
      className='relative z-10 overflow-hidden'
      style={{
        backgroundColor: 'var(--linear-bg-footer)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        paddingTop: '7rem',
        paddingBottom: '9rem',
      }}
    >
      {/* Top edge highlight */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-0 top-0 h-px'
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(255,255,255,0.1) 30%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.1) 70%, transparent)',
        }}
      />

      {/* Primary glow — centered, wide */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/3'
        style={{
          width: '900px',
          height: '600px',
          borderRadius: '50%',
          background:
            'radial-gradient(ellipse at center, oklch(28% 0.07 270 / 0.5) 0%, oklch(20% 0.04 270 / 0.2) 45%, transparent 70%)',
        }}
      />

      <Container size='homepage'>
        <div className='reveal-on-scroll relative mx-auto flex max-w-xl flex-col items-center text-center'>
          {/* Eyebrow */}
          <span
            className='mb-6 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.08em]'
            style={{
              borderColor: 'rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.45)',
            }}
          >
            Get started free
          </span>

          <h2
            data-testid='final-cta-headline'
            className='marketing-h2-linear text-white'
          >
            Give the next fan one clear place to go.
          </h2>

          <p
            className='mt-5 max-w-md marketing-lead-linear'
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            Claim your handle, launch your page, and finally own the data other
            platforms keep from you.
          </p>

          {/* Form */}
          <div className='mt-10 w-full'>
            <div
              id='final-cta-dock'
              data-testid='final-cta-dock'
              className='relative w-full overflow-hidden rounded-2xl p-2'
              style={{
                backgroundColor: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: [
                  '0 0 0 1px rgba(255,255,255,0.03)',
                  '0 8px 40px rgba(0,0,0,0.5)',
                  '0 32px 80px rgba(0,0,0,0.3)',
                ].join(', '),
              }}
            >
              {/* Top shine edge */}
              <div
                aria-hidden='true'
                className='pointer-events-none absolute inset-x-0 top-0 h-px'
                style={{
                  background:
                    'linear-gradient(90deg, transparent, rgba(255,255,255,0.12) 40%, rgba(255,255,255,0.12) 60%, transparent)',
                }}
              />
              <ClaimHandleForm />
            </div>
          </div>

          {/* Trust signals */}
          <div className='mt-6 flex items-center justify-center gap-4'>
            <p
              className='flex items-center gap-2'
              style={{
                fontSize: '12px',
                fontWeight: 450,
                color: 'rgba(255,255,255,0.38)',
              }}
            >
              <span
                aria-hidden='true'
                className='inline-block h-1.5 w-1.5 rounded-full bg-[var(--linear-success)] shadow-[0_0_6px_var(--linear-success)]'
              />
              Live in 60 seconds
            </p>
            <span
              aria-hidden='true'
              style={{ color: 'rgba(255,255,255,0.15)' }}
            >
              ·
            </span>
            <p
              style={{
                fontSize: '12px',
                fontWeight: 450,
                color: 'rgba(255,255,255,0.38)',
              }}
            >
              No credit card required
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
