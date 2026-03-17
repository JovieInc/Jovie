'use client';

import { Container } from '@/components/site/Container';
import { ClaimHandleForm } from './claim-handle';

export function FinalCTASection() {
  return (
    <section
      className='relative z-10 overflow-hidden'
      style={{
        backgroundColor: 'var(--linear-cta-bg)',
        borderTop: '1px solid var(--linear-cta-border-top)',
        paddingTop: 'var(--linear-cta-section-pt)',
        paddingBottom: 'var(--linear-cta-section-pb)',
      }}
    >
      {/* Top edge highlight */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-0 top-0 h-px'
        style={{ background: 'var(--linear-cta-edge-highlight)' }}
      />

      {/* Primary glow — centered, wide */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/3'
        style={{
          width: '900px',
          height: '600px',
          borderRadius: '50%',
          background: 'var(--linear-cta-glow-primary)',
        }}
      />

      <Container size='homepage'>
        <div className='reveal-on-scroll relative mx-auto flex max-w-xl flex-col items-center text-center'>
          {/* Eyebrow */}
          <span
            className='mb-6 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.08em]'
            style={{
              borderColor: 'var(--linear-cta-eyebrow-border)',
              color: 'var(--linear-cta-eyebrow-color)',
            }}
          >
            Get started free
          </span>

          <h2
            data-testid='final-cta-headline'
            className='marketing-h2-linear text-white'
          >
            Your music deserves better than a stack of links.
          </h2>

          <p
            className='mt-5 max-w-md marketing-lead-linear'
            style={{ color: 'var(--linear-cta-lead-color)' }}
          >
            Launch an artist profile that grows your audience with every
            release.
          </p>

          {/* Form */}
          <div className='mt-10 w-full'>
            <div
              id='final-cta-dock'
              data-testid='final-cta-dock'
              className='relative w-full overflow-hidden rounded-2xl p-2'
              style={{
                backgroundColor: 'var(--linear-cta-dock-bg)',
                border: '1px solid var(--linear-cta-dock-border)',
                boxShadow: 'var(--linear-cta-dock-shadow)',
              }}
            >
              {/* Top shine edge */}
              <div
                aria-hidden='true'
                className='pointer-events-none absolute inset-x-0 top-0 h-px'
                style={{ background: 'var(--linear-cta-dock-shine)' }}
              />
              <ClaimHandleForm />
            </div>
          </div>

          {/* Trust signals */}
          <div className='mt-6 flex items-center justify-center gap-4'>
            <p
              className='flex items-center gap-2 text-[length:var(--linear-label-size)] font-[number:var(--linear-font-weight-normal)]'
              style={{ color: 'var(--linear-cta-trust-color)' }}
            >
              <span
                aria-hidden='true'
                className='inline-block h-1.5 w-1.5 rounded-full bg-[var(--linear-success)] shadow-[0_0_6px_var(--linear-success)]'
              />{' '}
              Live in 60 seconds
            </p>
            <span
              aria-hidden='true'
              style={{ color: 'var(--linear-cta-trust-separator)' }}
            >
              ·
            </span>
            <p
              className='text-[length:var(--linear-label-size)] font-[number:var(--linear-font-weight-normal)]'
              style={{ color: 'var(--linear-cta-trust-color)' }}
            >
              No credit card required
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
