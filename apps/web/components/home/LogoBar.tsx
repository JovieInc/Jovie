import {
  ArmadaMusicLogo,
  AwalLogo,
  BlackHoleRecordingsLogo,
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
        <p className='text-[11px] font-[number:var(--linear-font-weight-medium)] uppercase tracking-[0.16em] text-[color:var(--linear-text-tertiary)]'>
          Trusted by artists on
        </p>
        <div
          className='flex w-auto flex-wrap items-center justify-center gap-x-9 gap-y-6 rounded-[28px] px-10 py-5 sm:flex-nowrap sm:gap-x-10 sm:px-12'
          style={{
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.02) 100%)',
            border: '1px solid rgba(255,255,255,0.07)',
            boxShadow:
              'inset 0 1px 0 rgba(255,255,255,0.05), 0 16px 40px rgba(0,0,0,0.18)',
          }}
        >
          {/* UMG: 24:1 aspect ratio — constrain by width, not height */}
          <UniversalMusicGroupLogo className='h-auto w-[88px] select-none text-[color:var(--linear-text-primary)] opacity-60 transition-opacity duration-[var(--linear-duration-slow)] hover:opacity-88 sm:w-[100px]' />
          <AwalLogo className='h-[13px] w-auto select-none text-[color:var(--linear-text-primary)] opacity-70 transition-opacity duration-[var(--linear-duration-slow)] hover:opacity-92 sm:h-[15px]' />
          <TheOrchardLogo className='h-[16px] w-auto select-none text-[color:var(--linear-text-primary)] opacity-68 transition-opacity duration-[var(--linear-duration-slow)] hover:opacity-90 sm:h-[18px]' />
          <ArmadaMusicLogo className='h-[13px] w-auto select-none text-[color:var(--linear-text-primary)] opacity-70 transition-opacity duration-[var(--linear-duration-slow)] hover:opacity-92 sm:h-[15px]' />
          <BlackHoleRecordingsLogo className='h-[12px] w-auto select-none text-[color:var(--linear-text-primary)] opacity-65 transition-opacity duration-[var(--linear-duration-slow)] hover:opacity-88 sm:h-[13px]' />
        </div>
      </div>
    </section>
  );
}
