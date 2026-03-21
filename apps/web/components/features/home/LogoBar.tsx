import {
  ArmadaMusicLogo,
  AwalLogo,
  TheOrchardLogo,
  UniversalMusicGroupLogo,
} from './label-logos';

export function LogoBar() {
  return (
    <section className='px-5 pb-7 pt-4 sm:px-6 md:pb-8 md:pt-5'>
      <div className='mx-auto max-w-[var(--linear-content-max)]'>
        <div
          aria-hidden='true'
          className='h-px w-full'
          style={{
            background:
              'linear-gradient(to right, transparent, var(--linear-separator-via), transparent)',
          }}
        />
        <div className='flex items-center justify-center py-4 md:py-5'>
          <div
            className='flex w-full flex-wrap items-center justify-center gap-x-10 gap-y-4 px-2 sm:flex-nowrap sm:gap-14 md:gap-16'
            style={{ opacity: 0.88 }}
          >
            <AwalLogo className='h-[14px] w-auto select-none text-primary-token opacity-72 transition-opacity duration-[var(--linear-duration-slow)] hover:opacity-95 sm:h-[16px]' />
            <TheOrchardLogo className='h-[18px] w-auto select-none text-primary-token opacity-76 transition-opacity duration-[var(--linear-duration-slow)] hover:opacity-95 sm:h-[20px]' />
            <UniversalMusicGroupLogo className='h-[10px] w-auto select-none text-primary-token opacity-76 transition-opacity duration-[var(--linear-duration-slow)] hover:opacity-95 sm:h-[12px]' />
            <ArmadaMusicLogo className='h-[12px] w-auto select-none text-primary-token opacity-72 transition-opacity duration-[var(--linear-duration-slow)] hover:opacity-95 sm:h-[14px]' />
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
