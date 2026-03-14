import {
  ArmadaMusicLogo,
  AwalLogo,
  TheOrchardLogo,
  UniversalMusicGroupLogo,
} from './label-logos';

export function LogoBar() {
  return (
    <section className='px-5 py-14 sm:px-6 md:py-18'>
      {/* Top gradient separator */}
      <div
        aria-hidden='true'
        className='mb-10 md:mb-12 h-px max-w-md mx-auto'
        style={{
          background:
            'linear-gradient(to right, transparent, var(--linear-separator-via), transparent)',
        }}
      />

      <div className='mx-auto flex max-w-[var(--linear-content-max)] flex-col items-center gap-5'>
        <p className='max-w-xl text-center text-[11px] font-[number:var(--linear-font-weight-medium)] uppercase tracking-[0.16em] text-[color:var(--linear-text-tertiary)]'>
          Used by artists across major-label and independent ecosystems
        </p>
        <div
          className='flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-10 gap-y-6 rounded-[28px] px-6 py-5 sm:flex-nowrap sm:gap-16 sm:px-10'
          style={{
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.02) 100%)',
            border: '1px solid rgba(255,255,255,0.07)',
            boxShadow:
              'inset 0 1px 0 rgba(255,255,255,0.05), 0 16px 40px rgba(0,0,0,0.18)',
          }}
        >
          <AwalLogo className='h-[14px] w-auto select-none text-[color:var(--linear-text-primary)] opacity-72 transition-opacity duration-[var(--linear-duration-slow)] hover:opacity-95 sm:h-[16px]' />
          <TheOrchardLogo className='h-[14px] w-auto select-none text-[color:var(--linear-text-primary)] opacity-76 transition-opacity duration-[var(--linear-duration-slow)] hover:opacity-95 sm:h-[16px]' />
          <UniversalMusicGroupLogo className='h-[10px] w-auto select-none text-[color:var(--linear-text-primary)] opacity-76 transition-opacity duration-[var(--linear-duration-slow)] hover:opacity-95 sm:h-[12px]' />
          <ArmadaMusicLogo className='h-[12px] w-auto select-none text-[color:var(--linear-text-primary)] opacity-72 transition-opacity duration-[var(--linear-duration-slow)] hover:opacity-95 sm:h-[14px]' />
        </div>
      </div>
    </section>
  );
}
