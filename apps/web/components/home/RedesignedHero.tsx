import { ClaimHandleForm } from './claim-handle';
import { LiveSignal, SectionLabel } from './marketing-atoms';

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
          <span className='mb-5'>
            <SectionLabel>Built for independent artists</SectionLabel>
          </span>
          <h1
            className='marketing-h1-linear text-[var(--linear-text-primary)]'
            style={{ fontWeight: 590 }}
          >
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
                  backgroundColor: 'rgba(255,255,255,0.02)',
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
                backgroundColor: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--linear-border-subtle)',
                boxShadow:
                  '0 0 0 1px rgba(255,255,255,0.03), 0 8px 32px rgba(0,0,0,0.3)',
              }}
            >
              <ClaimHandleForm />
            </div>
          </div>

          <div className='mt-4'>
            <LiveSignal>
              Free to start. Your page can be live in 60 seconds.
            </LiveSignal>
          </div>
        </div>
      </div>
    </section>
  );
}
