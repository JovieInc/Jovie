import {
  ArmadaMusicLogo,
  AwalLogo,
  SonyMusicLogo,
  UniversalMusicGroupLogo,
} from './label-logos';

export function LogoBar() {
  return (
    <section className='py-10 px-5 sm:px-6'>
      <div className='mx-auto flex max-w-[var(--linear-content-max)] flex-col items-center gap-6'>
        <p className='text-[var(--linear-label-size)] font-medium uppercase tracking-[0.1em] text-[var(--linear-text-tertiary)]'>
          Trusted by artists on
        </p>
        <div className='flex flex-wrap items-center justify-center gap-6 sm:gap-8 sm:flex-nowrap'>
          <SonyMusicLogo className='h-[14px] w-auto select-none text-[var(--linear-text-primary)] opacity-40 transition-opacity duration-normal hover:opacity-100 sm:h-[16px]' />
          <UniversalMusicGroupLogo className='h-[10px] w-auto select-none text-[var(--linear-text-primary)] opacity-40 transition-opacity duration-normal hover:opacity-100 sm:h-[12px]' />
          <AwalLogo className='h-[16px] w-auto select-none text-[var(--linear-text-primary)] opacity-40 transition-opacity duration-normal hover:opacity-100 sm:h-[18px]' />
          <ArmadaMusicLogo className='h-[14px] w-auto select-none text-[var(--linear-text-primary)] opacity-40 transition-opacity duration-normal hover:opacity-100 sm:h-[16px]' />
        </div>
      </div>
    </section>
  );
}
