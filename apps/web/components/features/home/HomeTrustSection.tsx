import {
  ArmadaMusicLogo,
  AwalLogo,
  BlackHoleRecordingsLogo,
  DiscoWaxLogo,
  TheOrchardLogo,
  UniversalMusicGroupLogo,
} from './label-logos';

const LOGO_CLASS = 'select-none text-white';

export function HomeTrustSection() {
  return (
    <section
      data-testid='homepage-trust'
      className='homepage-trust-strip'
      aria-label='Trusted by artists on major labels'
    >
      <p className='mb-4 text-center text-[12px] font-medium tracking-[-0.01em] text-tertiary-token sm:mb-5'>
        Trusted by artists on
      </p>
      <div className='homepage-trust-logos'>
        <AwalLogo className={`${LOGO_CLASS} h-[24px] w-auto`} />
        <TheOrchardLogo className={`${LOGO_CLASS} h-[34px] w-auto`} />
        <UniversalMusicGroupLogo className={`${LOGO_CLASS} h-[16px] w-auto`} />
        <ArmadaMusicLogo className={`${LOGO_CLASS} h-[24px] w-auto`} />
        <BlackHoleRecordingsLogo className={`${LOGO_CLASS} h-[20px] w-auto`} />
        <DiscoWaxLogo className={`${LOGO_CLASS} h-[18px] w-auto`} />
      </div>
    </section>
  );
}
