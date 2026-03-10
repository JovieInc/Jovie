import {
  ArmadaMusicLogo,
  AwalLogo,
  SonyMusicLogo,
  UniversalMusicGroupLogo,
} from './label-logos';

const ARTIST_COUNT = 47;

export function SocialProofSection() {
  return (
    <section className='py-[var(--linear-section-pt-sm)] px-5 sm:px-6'>
      <div className='mx-auto flex max-w-[var(--linear-content-max)] flex-col items-center gap-10'>
        {/* Founder credibility */}
        <div className='flex flex-col items-center gap-4 text-center'>
          <p className='text-[var(--linear-label-size)] font-medium uppercase tracking-[0.1em] text-[var(--linear-text-tertiary)]'>
            Built by a musician
          </p>
          <p className='max-w-[560px] text-base leading-relaxed text-[var(--linear-text-secondary)] sm:text-lg'>
            Jovie was created by{' '}
            <span className='font-medium text-[var(--linear-text-primary)]'>
              Tim White
            </span>
            , who has released music on Sony, Universal, AWAL, and Armada Music.
            Every feature is designed from real artist experience.
          </p>
          <div className='mt-2 flex flex-wrap items-center justify-center gap-6 sm:gap-8 sm:flex-nowrap'>
            <SonyMusicLogo className='h-[14px] w-auto select-none text-[var(--linear-text-primary)] opacity-40 sm:h-[16px]' />
            <UniversalMusicGroupLogo className='h-[10px] w-auto select-none text-[var(--linear-text-primary)] opacity-40 sm:h-[12px]' />
            <AwalLogo className='h-[16px] w-auto select-none text-[var(--linear-text-primary)] opacity-40 sm:h-[18px]' />
            <ArmadaMusicLogo className='h-[14px] w-auto select-none text-[var(--linear-text-primary)] opacity-40 sm:h-[16px]' />
          </div>
        </div>

        {/* Artist counter */}
        <div className='flex flex-col items-center gap-2'>
          <p className='text-3xl font-semibold tabular-nums text-[var(--linear-text-primary)] sm:text-4xl'>
            {ARTIST_COUNT}+
          </p>
          <p className='text-sm text-[var(--linear-text-tertiary)]'>
            artists already on Jovie
          </p>
        </div>
      </div>
    </section>
  );
}
