import {
  ArmadaMusicLogo,
  AwalLogo,
  TheOrchardLogo,
  UniversalMusicGroupLogo,
} from './label-logos';

export function LogoBar() {
  return (
    <section className='px-5 pb-4 pt-1.5 sm:px-6 md:pb-5 md:pt-2'>
      <div className='homepage-section-shell'>
        <div
          aria-hidden='true'
          className='h-px w-full'
          style={{
            background:
              'linear-gradient(to right, transparent, var(--linear-separator-via), transparent)',
          }}
        />
        <div className='flex items-center justify-center py-3.5 md:py-4'>
          <div className='flex w-full flex-wrap items-center justify-center gap-x-8 gap-y-3 px-1 opacity-[0.82] sm:flex-nowrap sm:gap-10 md:gap-12'>
            <AwalLogo className='h-[13px] w-auto select-none text-primary-token opacity-70 transition-opacity duration-[var(--linear-duration-slow)] hover:opacity-90 sm:h-[15px]' />
            <TheOrchardLogo className='h-[16px] w-auto select-none text-primary-token opacity-74 transition-opacity duration-[var(--linear-duration-slow)] hover:opacity-92 sm:h-[18px]' />
            <UniversalMusicGroupLogo className='h-[9px] w-auto select-none text-primary-token opacity-74 transition-opacity duration-[var(--linear-duration-slow)] hover:opacity-92 sm:h-[11px]' />
            <ArmadaMusicLogo className='h-[11px] w-auto select-none text-primary-token opacity-70 transition-opacity duration-[var(--linear-duration-slow)] hover:opacity-90 sm:h-[13px]' />
          </div>
        </div>
        <div
          aria-hidden='true'
          className='h-px w-full'
          style={{
            background:
              'linear-gradient(to right, transparent, var(--linear-separator-via), transparent)',
          }}
        />
      </div>
    </section>
  );
}
