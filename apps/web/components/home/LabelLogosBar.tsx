import {
  ArmadaMusicLogo,
  AwalLogo,
  BlackHoleRecordingsLogo,
  DiscoWaxLogo,
  SonyMusicLogo,
  UniversalMusicGroupLogo,
} from './label-logos';

export function LabelLogosBar() {
  return (
    <section
      aria-label='Record labels using Jovie'
      style={{ backgroundColor: 'var(--linear-bg-page)' }}
      className='px-5 pb-14 pt-0 sm:px-6 sm:pb-20 lg:px-[77px]'
    >
      <div className='w-full'>
        {/* Subtle separator */}
        <div
          aria-hidden='true'
          className='mb-10 sm:mb-14'
          style={{
            height: '1px',
            background:
              'linear-gradient(to right, rgba(255,255,255,0.06), rgba(255,255,255,0.03) 50%, transparent)',
          }}
        />
        <p
          className='mb-5 text-logo-muted'
          style={{
            fontSize: '0.6875rem',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
          }}
        >
          Driving streams to releases from
        </p>
        <div className='flex flex-wrap items-center gap-x-10 gap-y-4'>
          <SonyMusicLogo className='h-5 w-auto text-logo-muted select-none' />
          <UniversalMusicGroupLogo className='h-4 w-auto text-logo-muted select-none' />
          <AwalLogo className='h-5 w-auto text-logo-muted select-none' />
          <ArmadaMusicLogo className='h-4 w-auto text-logo-muted select-none' />
          <BlackHoleRecordingsLogo className='h-4 w-auto text-logo-muted select-none' />
          <DiscoWaxLogo className='h-5 w-auto text-logo-muted select-none' />
        </div>
      </div>
    </section>
  );
}
