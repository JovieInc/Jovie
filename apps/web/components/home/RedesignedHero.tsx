import { ClaimHandleForm } from './claim-handle';
import { HeroProfilePreview } from './HeroProfilePreview';

export function RedesignedHero() {
  return (
    <section className='relative flex flex-1 flex-col items-center overflow-hidden px-5 sm:px-6 pt-[max(16vh,100px)] pb-0'>
      {/* Primary ambient glow — barely perceptible warmth */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% 25%, oklch(18% 0.015 260 / 0.25), transparent 70%)',
        }}
      />

      <div className='relative w-full max-w-[var(--linear-content-max)] z-10'>
        {/* Centered text block — Linear layout */}
        <div className='hero-stagger flex flex-col items-center text-center max-w-2xl mx-auto'>
          <h1
            className='marketing-h1-linear text-[var(--linear-text-primary)]'
            style={{ fontWeight: 590 }}
          >
            The link in bio that <br className='hidden sm:block' />
            actually converts.
          </h1>

          <p
            className='mt-5 max-w-[460px]'
            style={{
              fontSize: 'clamp(15px, 1.2vw + 0.4rem, 17px)',
              lineHeight: '1.65',
              letterSpacing: '-0.011em',
              fontWeight: 400,
              color: 'var(--linear-text-secondary)',
            }}
          >
            Sync Spotify once. Jovie builds a profile that captures emails,
            directs streams, and earns tips — all on autopilot.
          </p>

          <div className='mt-8 w-full max-w-[480px]'>
            <div
              className='relative rounded-2xl p-2'
              style={{
                backgroundColor: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
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
              color: 'var(--linear-text-quaternary)',
            }}
          >
            <span
              aria-hidden='true'
              className='inline-block h-1.5 w-1.5 rounded-full bg-[var(--linear-success)] shadow-[0_0_6px_var(--linear-success)]'
            />{' '}
            Free forever. Live in 60 seconds.
          </p>
        </div>

        {/* Product preview — real profile components with mocked data */}
        <div className='hero-stagger mt-16 sm:mt-20 [animation-delay:300ms]'>
          <HeroProfilePreview />
        </div>
      </div>
    </section>
  );
}
