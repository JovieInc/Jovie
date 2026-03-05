import { ClaimHandleForm } from './claim-handle';
import {
  ArmadaMusicLogo,
  AwalLogo,
  SonyMusicLogo,
  UniversalMusicGroupLogo,
} from './label-logos';
import { PhoneHeroDemo } from './PhoneHeroDemo';

export function RedesignedHero() {
  return (
    <section className='relative flex flex-1 flex-col items-center overflow-hidden px-5 sm:px-6 pt-[var(--linear-section-pt-lg)] pb-[var(--linear-section-pb-md)]'>
      {/* Ambient glow — centered */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 hero-glow'
        style={{
          transform: 'translateY(-10%)',
        }}
      />

      <div className='relative w-full max-w-[var(--linear-content-max)] z-10'>
        {/* Two-column layout: text left, phone right on md+ */}
        <div className='flex flex-col items-center gap-10 md:flex-row md:items-center md:gap-12 lg:gap-16'>
          {/* Left column: text + CTA */}
          <div className='flex flex-col items-center text-center md:items-start md:text-left md:flex-1 heading-gap-linear'>
            <h1 className='marketing-h1-linear text-[var(--linear-text-primary)]'>
              The smartest link in bio <br className='hidden md:block' />
              for musicians.
            </h1>

            <p className='marketing-lead-linear mt-6 max-w-[480px] text-[var(--linear-text-secondary)]'>
              One link. Zero setup. Just sync your Spotify, and let Jovie&apos;s
              AI <br className='hidden sm:block md:hidden' />
              build a beautiful profile designed to convert.
            </p>

            <div className='mt-6 w-full max-w-[480px] text-left'>
              <ClaimHandleForm />
            </div>

            <p className='mt-3 flex items-center justify-center md:justify-start gap-2 text-[var(--linear-label-size)] font-[var(--linear-font-weight-medium)] tracking-[var(--linear-tracking-wide)] text-[var(--linear-text-tertiary)]'>
              <span
                aria-hidden='true'
                className='inline-block h-1.5 w-1.5 rounded-full bg-[var(--linear-success)] shadow-[0_0_8px_var(--linear-success)]'
              />{' '}
              Set up in under 60 seconds.
            </p>

            {/* Label logos */}
            <div className='mt-8 flex flex-col items-center md:items-start gap-4'>
              <p className='text-[var(--linear-label-size)] font-medium text-[var(--linear-text-tertiary)] uppercase tracking-[0.1em]'>
                Trusted by artists on
              </p>
              <div className='flex flex-wrap items-center gap-4 sm:gap-6 sm:flex-nowrap'>
                <SonyMusicLogo className='h-[14px] w-auto select-none text-[var(--linear-text-primary)] opacity-40 transition-opacity duration-normal hover:opacity-100 sm:h-[16px]' />
                <UniversalMusicGroupLogo className='h-[10px] w-auto select-none text-[var(--linear-text-primary)] opacity-40 transition-opacity duration-normal hover:opacity-100 sm:h-[12px]' />
                <AwalLogo className='h-[16px] w-auto select-none text-[var(--linear-text-primary)] opacity-40 transition-opacity duration-normal hover:opacity-100 sm:h-[18px]' />
                <ArmadaMusicLogo className='h-[14px] w-auto select-none text-[var(--linear-text-primary)] opacity-40 transition-opacity duration-normal hover:opacity-100 sm:h-[16px]' />
              </div>
            </div>
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
