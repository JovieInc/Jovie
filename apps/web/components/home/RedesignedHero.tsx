import { ClaimHandleForm } from './claim-handle';

export function RedesignedHero() {
  return (
    <section className='relative flex flex-1 flex-col items-center overflow-hidden px-5 sm:px-6 pt-[10rem] pb-[7rem]'>
      {/* Primary ambient glow — barely perceptible warmth */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% 25%, oklch(85% 0.04 270 / 0.4), transparent 65%)',
        }}
      />

      <div className='relative w-full max-w-[var(--linear-content-max)] z-10'>
        {/* Centered text block — Linear layout */}
        <div className='hero-stagger flex flex-col items-center text-center max-w-2xl mx-auto'>
          <span className='inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium tracking-[-0.01em] text-[color:var(--linear-text-tertiary)] border border-[var(--linear-border-subtle)] mb-5'>
            Built for independent artists
          </span>
          <h1 className='marketing-h1-linear text-[var(--linear-text-primary)]'>
            Turn profile visits into <br className='hidden sm:block' />
            fans you can reach.
          </h1>

          <p className='mt-5 max-w-[460px] marketing-lead-linear text-[var(--linear-text-secondary)]'>
            Jovie gives every artist one smart home for releases, shows, and
            tips. Capture fan contact info, send people to the right next step,
            and own the audience you worked to earn.
          </p>

          <div className='mt-6 grid w-full max-w-[620px] gap-3 sm:grid-cols-3'>
            {[
              'Capture emails and cities from every visit',
              'Route fans to music, tickets, or tips automatically',
              'Launch a polished page in under a minute',
            ].map(item => (
              <div
                key={item}
                className='rounded-2xl px-4 py-3 text-left text-[13px] leading-5 text-[var(--linear-text-secondary)]'
                style={{
                  backgroundColor: 'var(--linear-bg-surface-1)',
                  border: '1px solid var(--linear-border-subtle)',
                }}
              >
                {item}
              </div>
            ))}
          </div>

          <div className='mt-8 w-full max-w-[480px]'>
            <div
              className='relative rounded-2xl p-2'
              style={{
                backgroundColor: 'var(--linear-bg-surface-1)',
                border: '1px solid var(--linear-border-subtle)',
                boxShadow: 'var(--linear-shadow-card-elevated)',
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
            Free to start. Your page can be live in 60 seconds.
          </p>
        </div>
      </div>
    </section>
  );
}
