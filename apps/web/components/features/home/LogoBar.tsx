import {
  ArmadaMusicLogo,
  AwalLogo,
  TheOrchardLogo,
  UniversalMusicGroupLogo,
} from './label-logos';

export function LogoBar() {
  return (
    <section
      className='relative z-20 px-5 pb-4 pt-1.5 sm:px-6 md:pb-5 md:pt-2'
      style={{
        backgroundColor: 'var(--linear-bg-page)',
        boxShadow: '0 -30px 60px rgba(0,0,0,0.4)',
      }}
    >
      <div className='homepage-section-shell'>
        <div
          aria-hidden='true'
          className='h-px w-full'
          style={{
            background:
              'linear-gradient(to right, transparent, rgba(255,255,255,0.07), transparent)',
          }}
        />
        <div className='flex flex-col items-center justify-center py-3.5 md:py-4'>
          <p className='text-center text-xs text-quaternary-token mb-3 tracking-wide'>
            Trusted by artists on
          </p>
          <div className='flex w-full flex-wrap items-center justify-center gap-x-8 gap-y-3 px-1 opacity-[0.82] sm:flex-nowrap sm:gap-10 md:gap-12'>
            <AwalLogo className='h-[17px] w-auto select-none text-primary-token opacity-70 transition-opacity duration-[var(--linear-duration-slow)] hover:opacity-90 sm:h-[20px]' />
            <TheOrchardLogo className='h-[21px] w-auto select-none text-primary-token opacity-74 transition-opacity duration-[var(--linear-duration-slow)] hover:opacity-92 sm:h-[23px]' />
            <UniversalMusicGroupLogo className='h-[12px] w-auto select-none text-primary-token opacity-74 transition-opacity duration-[var(--linear-duration-slow)] hover:opacity-92 sm:h-[14px]' />
            <ArmadaMusicLogo className='h-[14px] w-auto select-none text-primary-token opacity-70 transition-opacity duration-[var(--linear-duration-slow)] hover:opacity-90 sm:h-[17px]' />
          </div>
        </div>
        <div
          aria-hidden='true'
          className='h-px w-full'
          style={{
            background:
              'linear-gradient(to right, transparent, rgba(255,255,255,0.07), transparent)',
          }}
        />
      </div>
    </section>
  );
}
