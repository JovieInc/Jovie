import {
  ArmadaMusicLogo,
  AwalLogo,
  SonyMusicLogo,
  UniversalMusicGroupLogo,
} from './label-logos';

export function LogoBar() {
  return (
    <section className='py-12 md:py-16 px-5 sm:px-6'>
      {/* Top gradient separator */}
      <div
        aria-hidden='true'
        className='mb-10 md:mb-12 h-px max-w-md mx-auto'
        style={{
          background:
            'linear-gradient(to right, transparent, var(--linear-border-subtle), transparent)',
        }}
      />

      <div className='mx-auto flex max-w-[var(--linear-content-max)] flex-col items-center gap-5'>
        <p className='text-[11px] font-[var(--linear-font-weight-medium)] uppercase tracking-[0.12em] text-[var(--linear-text-tertiary)]'>
          Trusted by artists on
        </p>
        <div className='flex flex-wrap items-center justify-center gap-8 sm:gap-10 sm:flex-nowrap'>
          <SonyMusicLogo className='h-[14px] w-auto select-none text-[var(--linear-text-primary)] opacity-30 transition-opacity duration-300 hover:opacity-70 sm:h-[16px]' />
          <UniversalMusicGroupLogo className='h-[10px] w-auto select-none text-[var(--linear-text-primary)] opacity-30 transition-opacity duration-300 hover:opacity-70 sm:h-[12px]' />
          <AwalLogo className='h-[16px] w-auto select-none text-[var(--linear-text-primary)] opacity-30 transition-opacity duration-300 hover:opacity-70 sm:h-[18px]' />
          <ArmadaMusicLogo className='h-[14px] w-auto select-none text-[var(--linear-text-primary)] opacity-30 transition-opacity duration-300 hover:opacity-70 sm:h-[16px]' />
        </div>
      </div>
    </section>
  );
}
