import {
  ArmadaMusicLogo,
  AwalLogo,
  TheOrchardLogo,
  UniversalMusicGroupLogo,
} from './label-logos';

export function LogoBar() {
  return (
    <section
      className='relative z-20 px-5 pb-6 pt-3 sm:px-6 md:pb-8 md:pt-4'
      style={{
        backgroundColor: 'var(--linear-bg-page)',
        boxShadow: '0 -30px 60px rgba(0,0,0,0.4)',
      }}
    >
      {/* Subtle centered glow behind logos */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{
          background:
            'radial-gradient(ellipse 50% 80% at 50% 50%, oklch(14% 0.015 270 / 0.25), transparent 70%)',
        }}
      />
      <div className='homepage-section-shell'>
        <div
          aria-hidden='true'
          className='h-px w-full'
          style={{
            background:
              'linear-gradient(to right, transparent, rgba(255,255,255,0.09), transparent)',
          }}
        />
        <div className='flex flex-col items-center justify-center py-6 md:py-8'>
          <p className='text-center text-xs text-quaternary-token mb-4 tracking-wide'>
            Trusted by artists on
          </p>
          <div className='flex w-full flex-wrap items-center justify-center gap-x-10 gap-y-4 px-1 opacity-[0.82] sm:flex-nowrap sm:gap-14 md:gap-16'>
            <AwalLogo className='h-[20px] w-auto select-none text-primary-token opacity-70 transition-opacity duration-[var(--linear-duration-slow)] hover:opacity-90 sm:h-[23px]' />
            <TheOrchardLogo className='h-[24px] w-auto select-none text-primary-token opacity-74 transition-opacity duration-[var(--linear-duration-slow)] hover:opacity-92 sm:h-[26px]' />
            <UniversalMusicGroupLogo className='h-[14px] w-auto select-none text-primary-token opacity-74 transition-opacity duration-[var(--linear-duration-slow)] hover:opacity-92 sm:h-[16px]' />
            <ArmadaMusicLogo className='h-[16px] w-auto select-none text-primary-token opacity-70 transition-opacity duration-[var(--linear-duration-slow)] hover:opacity-90 sm:h-[19px]' />
          </div>
        </div>
        <div
          aria-hidden='true'
          className='h-px w-full'
          style={{
            background:
              'linear-gradient(to right, transparent, rgba(255,255,255,0.09), transparent)',
          }}
        />
      </div>
    </section>
  );
}
