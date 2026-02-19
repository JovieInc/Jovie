import {
  ArmadaMusicLogo,
  AwalLogo,
  SonyMusicLogo,
  UniversalMusicGroupLogo,
} from './label-logos';

export function LabelLogosBar() {
  return (
    <section
      aria-label='Record labels using Jovie'
      className='bg-[var(--linear-bg-page)] px-5 pb-14 pt-0 sm:px-6 sm:pb-20 lg:px-[77px]'
    >
      <div className='w-full'>
        {/* Subtle separator */}
        <div
          aria-hidden='true'
          className='mb-10 sm:mb-14 h-px'
          style={{
            background: `linear-gradient(to right, var(--linear-separator-from), var(--linear-separator-via), transparent)`,
          }}
        />
        <p className='mb-5 text-logo-muted text-[0.6875rem] font-medium uppercase tracking-[0.12em]'>
          Trusted by artists on
        </p>
        <div className='flex flex-wrap items-center gap-x-10 gap-y-5'>
          <SonyMusicLogo className='h-[18px] w-auto text-logo-muted select-none' />
          <UniversalMusicGroupLogo className='h-[13px] w-auto text-logo-muted select-none' />
          <AwalLogo className='h-5 w-auto text-logo-muted select-none' />
          <ArmadaMusicLogo className='h-[22px] w-auto text-logo-muted select-none' />
        </div>
      </div>
    </section>
  );
}
