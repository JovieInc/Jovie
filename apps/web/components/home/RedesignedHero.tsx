import { ClaimHandleForm } from './claim-handle';

export function RedesignedHero() {
  return (
    <section className='relative flex flex-1 flex-col items-center overflow-hidden px-5 sm:px-6 pt-[max(16vh,100px)] pb-0'>
      {/* Primary ambient glow — barely perceptible warmth */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% 25%, oklch(18% 0.015 260 / 0.2), transparent 65%)',
        }}
      />

      <div className='relative w-full max-w-[var(--linear-content-max)] z-10'>
        {/* Centered text block — Linear layout */}
        <div className='hero-stagger flex flex-col items-center text-center max-w-2xl mx-auto'>
          <span className='inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium tracking-[-0.01em] text-[color:var(--linear-text-tertiary)] border border-[var(--linear-border-subtle)] mb-5'>
            Built for independent music artists
          </span>
          <h1
            className='marketing-h1-linear text-[var(--linear-text-primary)]'
            style={{ fontWeight: 590 }}
          >
            The link in bio your <br className='hidden sm:block' />
            music deserves.
          </h1>

          <p className='mt-5 max-w-[460px] marketing-lead-linear text-[var(--linear-text-secondary)]'>
            Sync Spotify once. Jovie builds a profile that captures emails,
            directs streams, and earns tips — all on autopilot.
          </p>

          <div className='mt-8 w-full max-w-[480px]'>
            <div
              className='relative rounded-2xl p-2'
              style={{
                backgroundColor: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--linear-border-subtle)',
                boxShadow:
                  '0 0 0 1px rgba(255,255,255,0.03), 0 8px 32px rgba(0,0,0,0.3)',
              }}
            >
              <ClaimHandleForm />
            </div>
          </div>

          <p
            className='mt-4 flex items-center justify-center gap-2'
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
            Free to start. Live in 60 seconds.
          </p>
        </div>
      </div>
    </section>
  );
}
