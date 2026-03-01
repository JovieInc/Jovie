import { DemoReleasesExperience } from '@/components/demo/DemoReleasesExperience';
import { ClaimHandleForm } from './claim-handle';
import {
  ArmadaMusicLogo,
  AwalLogo,
  SonyMusicLogo,
  UniversalMusicGroupLogo,
} from './label-logos';

export function RedesignedHero() {
  return (
    <section className='relative flex flex-1 flex-col items-center overflow-hidden px-5 sm:px-6 pt-[120px] lg:pt-[160px] pb-10'>
      {/* Ambient glow — centered */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{
          background: 'var(--linear-hero-glow)',
          transform: 'translateY(-20%)',
        }}
      />

      <div className='relative flex w-full max-w-[984px] flex-col items-center text-center z-10'>
        <h1
          className='max-w-[900px]'
          style={{
            fontSize: 'clamp(40px, 8vw, 80px)',
            fontWeight: 510,
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            color: 'var(--linear-text-primary)',
            fontFeatureSettings: '"cv01", "ss03", "rlig" 1, "calt" 1',
            fontVariationSettings: '"opsz" 64',
          }}
        >
          The smartest link in bio <br className='hidden md:block' />
          for musicians.
        </h1>

        <p
          className='mx-auto mt-6 max-w-[600px]'
          style={{
            fontSize: 'clamp(18px, 2vw, 21px)',
            fontWeight: 400,
            lineHeight: 1.5,
            letterSpacing: '-0.011em',
            color: 'var(--linear-text-secondary)',
          }}
        >
          Capture contacts. Route listeners. Grow your audience.{' '}
          <br className='hidden sm:block' />
          Everything you need to turn streams into super-fans.
        </p>

        <div className='mt-10 w-full max-w-[480px] text-left'>
          <ClaimHandleForm />
        </div>

        <p
          className='mt-4 flex items-center justify-center gap-2'
          style={{
            fontSize: '13px',
            fontWeight: 510,
            letterSpacing: '0.01em',
            color: 'var(--linear-text-tertiary)',
          }}
        >
          <span
            aria-hidden='true'
            className='inline-block h-1.5 w-1.5 rounded-full bg-(--linear-success) shadow-[0_0_8px_var(--linear-success)]'
          />{' '}
          Free forever. No credit card.
        </p>

        {/* Small inline Label Logos */}
        <div className='mt-12 flex flex-col items-center gap-4'>
          <p className='text-[12px] font-medium text-[var(--linear-text-tertiary)] uppercase tracking-widest'>
            Trusted by artists on
          </p>
          <div className='flex items-center gap-6 sm:gap-8'>
            <SonyMusicLogo className='h-[14px] w-auto select-none text-[var(--linear-text-primary)] opacity-40 transition-opacity duration-300 hover:opacity-100 sm:h-[16px]' />
            <UniversalMusicGroupLogo className='h-[10px] w-auto select-none text-[var(--linear-text-primary)] opacity-40 transition-opacity duration-300 hover:opacity-100 sm:h-[12px]' />
            <AwalLogo className='h-[16px] w-auto select-none text-[var(--linear-text-primary)] opacity-40 transition-opacity duration-300 hover:opacity-100 sm:h-[18px]' />
            <ArmadaMusicLogo className='h-[14px] w-auto select-none text-[var(--linear-text-primary)] opacity-40 transition-opacity duration-300 hover:opacity-100 sm:h-[16px]' />
          </div>
        </div>

        {/* Product Shot */}
        <div className='relative w-full max-w-[1100px] mt-20 lg:mt-24 text-left pointer-events-none'>
          <div
            className='relative w-full overflow-hidden rounded-t-xl lg:rounded-t-2xl border-t border-l border-r border-[var(--linear-border-subtle)]'
            style={{
              backgroundColor: 'rgba(10, 14, 24, 0.95)',
              boxShadow:
                '0 0 0 1px rgba(0,0,0,0.5), 0 30px 60px -12px rgba(0,0,0,0.8), 0 50px 100px -20px rgba(0,0,0,0.8)',
              maskImage:
                'linear-gradient(to bottom, black 50%, transparent 100%)',
              WebkitMaskImage:
                'linear-gradient(to bottom, black 50%, transparent 100%)',
            }}
          >
            {/* Interactive Demo (Edge-to-edge UI) */}
            <div className='bg-surface-0'>
              <DemoReleasesExperience containerClassName='h-[480px] lg:h-[580px] overflow-hidden border-none m-0 bg-transparent' />
            </div>

            {/* Bottom gradient fade */}
            <div className='pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-[rgba(10,14,24,1)] to-transparent z-30' />
          </div>
        </div>
      </div>
    </section>
  );
}
