import {
  ArmadaMusicLogo,
  AwalLogo,
  SonyMusicLogo,
  UniversalMusicGroupLogo,
} from './label-logos';

export function LogoBar() {
  return (
    <section className='py-16 md:py-20 px-5 sm:px-6'>
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
        <p
          className='text-[11px] font-medium uppercase tracking-[0.12em]'
          style={{ color: 'var(--linear-text-quaternary)' }}
        >
          Trusted by artists on
        </p>
        <div className='flex flex-wrap items-center justify-center gap-10 sm:gap-14 sm:flex-nowrap'>
          <AwalLogo className='h-[14px] w-auto select-none text-[var(--linear-text-primary)] opacity-15 transition-opacity duration-300 hover:opacity-40 sm:h-[16px]' />
          <SonyMusicLogo className='h-[14px] w-auto select-none text-[var(--linear-text-primary)] opacity-20 transition-opacity duration-300 hover:opacity-50 sm:h-[16px]' />
          <UniversalMusicGroupLogo className='h-[10px] w-auto select-none text-[var(--linear-text-primary)] opacity-20 transition-opacity duration-300 hover:opacity-50 sm:h-[12px]' />
          <ArmadaMusicLogo className='h-[12px] w-auto select-none text-[var(--linear-text-primary)] opacity-15 transition-opacity duration-300 hover:opacity-40 sm:h-[14px]' />
        </div>
      </div>
    </section>
  );
}
