import { HeroSpotifySearch } from '@/components/home/HeroSpotifySearch';
import { LOGOS, WRAP } from './shared';

export function HeroSection() {
  return (
    <>
      {/* ═══ 1. HERO ═══ */}
      <section
        aria-labelledby='hero-heading'
        className='relative pt-40 md:pt-48 lg:pt-52 pb-16 md:pb-20 lg:pb-24 overflow-hidden'
      >
        <div
          className='hero-glow pointer-events-none absolute inset-0'
          aria-hidden='true'
        />

        <div className={`${WRAP} relative`}>
          <div className='flex flex-col items-center text-center'>
            <h1 id='hero-heading' className='marketing-h1-linear max-w-[780px]'>
              Your entire music career.{' '}
              <span className='text-secondary-token'>
                One intelligent link.
              </span>
            </h1>

            <p className='marketing-lead-linear mt-6 max-w-[520px] text-secondary-token'>
              Import your Spotify, get smart links for every release, and a
              link-in-bio that converts listeners into fans.
            </p>

            <p className='mt-6 text-sm text-tertiary-token'>
              Free forever. No credit card.
            </p>

            <div className='mt-4 w-full max-w-[520px]'>
              <HeroSpotifySearch />
            </div>

            <a
              href='#how-it-works'
              className='mt-6 inline-flex items-center gap-1.5 text-sm text-tertiary-token hover:text-secondary-token transition-colors focus-ring rounded'
            >
              See how it works
              <svg
                width='12'
                height='12'
                viewBox='0 0 12 12'
                fill='none'
                className='mt-px'
                aria-hidden='true'
              >
                <path
                  d='M6 2.5v7M3 7l3 3 3-3'
                  stroke='currentColor'
                  strokeWidth='1.5'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* ═══ 2. LOGOS ═══ */}
      <div className='py-14 border-b border-subtle'>
        <div className={WRAP}>
          <div className='flex items-center justify-between flex-wrap gap-6'>
            {LOGOS.map(name => (
              <span
                key={name}
                className='text-sm font-medium text-secondary-token opacity-55'
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
