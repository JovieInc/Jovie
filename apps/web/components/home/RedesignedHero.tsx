import { DemoReleasesExperience } from '@/components/demo/DemoReleasesExperience';
import { ClaimHandleForm } from './claim-handle';
import {
  ArmadaMusicLogo,
  AwalLogo,
  SonyMusicLogo,
  UniversalMusicGroupLogo,
} from './label-logos';

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

      <div className='relative flex w-full max-w-[var(--linear-content-max)] flex-col items-center text-center z-10 heading-gap-linear'>
        <h1 className='marketing-h1-linear max-w-[var(--linear-hero-h1-width)] text-[var(--linear-text-primary)]'>
          The smartest link in bio <br className='hidden md:block' />
          for musicians.
        </h1>

        <p className='marketing-lead-linear mx-auto mt-6 max-w-[var(--linear-hero-lead-width)] text-[var(--linear-text-secondary)]'>
          One link. Zero setup. Just sync your Spotify, and let Jovie’s AI{' '}
          <br className='hidden sm:block' />
          build a beautifully optimized profile designed to convert.
        </p>

        <div className='mt-6 w-full max-w-[480px] text-left'>
          <ClaimHandleForm />
        </div>

        <p className='mt-3 flex items-center justify-center gap-2 text-[var(--linear-label-size)] font-[var(--linear-font-weight-medium)] tracking-[var(--linear-tracking-wide)] text-[var(--linear-text-tertiary)]'>
          <span
            aria-hidden='true'
            className='inline-block h-1.5 w-1.5 rounded-full bg-[var(--linear-success)] shadow-[0_0_8px_var(--linear-success)]'
          />{' '}
          Free forever. No credit card.
        </p>

        {/* Small inline Label Logos */}
        <div className='mt-8 flex flex-col items-center gap-4'>
          <p className='text-[var(--linear-label-size)] font-medium text-[var(--linear-text-tertiary)] uppercase tracking-[0.1em]'>
            Trusted by artists on
          </p>
          <div className='flex items-center gap-6 sm:gap-8'>
            <SonyMusicLogo className='h-[14px] w-auto select-none text-[var(--linear-text-primary)] opacity-40 transition-opacity duration-normal hover:opacity-100 sm:h-[16px]' />
            <UniversalMusicGroupLogo className='h-[10px] w-auto select-none text-[var(--linear-text-primary)] opacity-40 transition-opacity duration-normal hover:opacity-100 sm:h-[12px]' />
            <AwalLogo className='h-[16px] w-auto select-none text-[var(--linear-text-primary)] opacity-40 transition-opacity duration-normal hover:opacity-100 sm:h-[18px]' />
            <ArmadaMusicLogo className='h-[14px] w-auto select-none text-[var(--linear-text-primary)] opacity-40 transition-opacity duration-normal hover:opacity-100 sm:h-[16px]' />
          </div>
        </div>

        {/* Product Shot */}
        <div className='relative w-full max-w-[1024px] mt-12 lg:mt-16 text-left pointer-events-none'>
          <div
            className='relative w-full overflow-hidden rounded-t-xl lg:rounded-t-2xl border-t border-l border-r border-[var(--linear-border-subtle)]'
            style={{
              backgroundColor: 'var(--linear-bg-surface-0)',
              boxShadow: 'var(--linear-shadow-card-elevated)',
              maskImage:
                'linear-gradient(to bottom, black 50%, transparent 100%)',
              WebkitMaskImage:
                'linear-gradient(to bottom, black 50%, transparent 100%)',
            }}
          >
            {/* Interactive Demo (Edge-to-edge UI) */}
            <div className='bg-[var(--linear-bg-surface-0)]'>
              <DemoReleasesExperience containerClassName='h-[480px] lg:h-[580px] overflow-hidden border-none m-0 bg-transparent' />
            </div>

            {/* Bottom gradient fade */}
            <div className='pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-[var(--linear-bg-page)] to-transparent z-30' />
          </div>
        </div>
      </div>
    </section>
  );
}
