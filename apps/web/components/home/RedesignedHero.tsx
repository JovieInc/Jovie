import { ClaimHandleForm } from './claim-handle';
import { PhoneHeroDemo } from './PhoneHeroDemo';

export function RedesignedHero() {
  return (
    <section className='relative flex flex-1 flex-col items-center overflow-hidden px-5 sm:px-6 pt-[max(14vh,80px)] pb-20 md:pb-32'>
      {/* Primary ambient glow — large diffused radial */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{
          background:
            'radial-gradient(ellipse 70% 60% at 50% 30%, oklch(22% 0.03 260 / 0.4), transparent 70%)',
        }}
      />
      {/* Secondary accent glow — warm tint offset right for depth */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{
          background:
            'radial-gradient(ellipse 40% 40% at 65% 35%, oklch(25% 0.04 280 / 0.15), transparent 60%)',
        }}
      />

      <div className='relative w-full max-w-[var(--linear-content-max)] z-10'>
        {/* Two-column layout: text left, phone right on md+ */}
        <div className='flex flex-col items-center gap-12 md:flex-row md:items-center md:gap-16 lg:gap-20'>
          {/* Left column: text + CTA */}
          <div className='flex flex-col items-center text-center md:items-start md:text-left md:flex-1'>
            <h1 className='marketing-h1-linear text-[var(--linear-text-primary)]'>
              The link in bio that <br className='hidden md:block' />
              actually converts.
            </h1>

            <p className='marketing-lead-linear mt-6 max-w-[480px] text-[var(--linear-text-secondary)]'>
              Sync Spotify once. Jovie builds a profile that captures emails,
              directs streams, and earns tips — all on autopilot.
            </p>

            <div className='mt-8 w-full max-w-[480px] text-left'>
              <ClaimHandleForm />
            </div>

            <p className='mt-4 flex items-center justify-center md:justify-start gap-2 text-[var(--linear-label-size)] font-[var(--linear-font-weight-medium)] tracking-[var(--linear-tracking-wide)] text-[var(--linear-text-tertiary)]'>
              <span
                aria-hidden='true'
                className='inline-block h-1.5 w-1.5 rounded-full bg-[var(--linear-success)] shadow-[0_0_8px_var(--linear-success)]'
              />{' '}
              Free forever. Live in 60 seconds.
            </p>
          </div>

          {/* Right column: phone mockup */}
          <div className='flex-shrink-0 flex justify-center md:justify-end'>
            <PhoneHeroDemo />
          </div>
        </div>
      </div>
    </section>
  );
}
