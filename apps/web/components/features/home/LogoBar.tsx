/**
 * Logo bar showing record labels where Jovie artists distribute.
 * Matches Linear.app's logo bar pattern: single row of muted logos
 * with gradient dividers, on dark background.
 */
import {
  ArmadaMusicLogo,
  AwalLogo,
  TheOrchardLogo,
  UniversalMusicGroupLogo,
} from './label-logos';

const LOGO_CLASS =
  'select-none text-primary-token opacity-70 transition-opacity duration-300 hover:opacity-90';

export function LogoBar() {
  return (
    <section className='relative z-20 overflow-hidden'>
      <div className='homepage-section-shell'>
        {/* Top divider */}
        <div
          aria-hidden='true'
          className='h-px w-full'
          style={{
            background:
              'linear-gradient(to right, transparent, rgba(255,255,255,0.09), transparent)',
          }}
        />

        <div className='flex flex-col items-center justify-center py-6 md:py-8'>
          <p className='mb-5 text-center text-[11px] tracking-[0.06em] uppercase text-tertiary-token'>
            Trusted by artists on
          </p>

          <div className='flex w-full flex-wrap items-center justify-center gap-x-10 gap-y-4 px-4 opacity-[0.82] sm:flex-nowrap sm:gap-14 md:gap-16'>
            <AwalLogo className={`${LOGO_CLASS} h-[20px] w-auto sm:h-[23px]`} />
            <TheOrchardLogo
              className={`${LOGO_CLASS} h-[24px] w-auto sm:h-[26px]`}
            />
            <UniversalMusicGroupLogo
              className={`${LOGO_CLASS} h-[14px] w-auto sm:h-[16px]`}
            />
            <ArmadaMusicLogo
              className={`${LOGO_CLASS} h-[16px] w-auto sm:h-[19px]`}
            />
          </div>
        </div>

        {/* Bottom divider */}
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
