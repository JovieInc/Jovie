import { HeroSpotifySearch } from './HeroSpotifySearch';

/**
 * RedesignedHero - Clean, left-aligned hero section
 * Supports both light and dark mode via --linear-* CSS custom properties.
 */
export function RedesignedHero() {
  return (
    <section className='relative flex flex-1 flex-col justify-center overflow-hidden px-5 pb-16 sm:px-6 lg:px-[77px]'>
      {/* Ambient glow — subtle depth cue behind content */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{ background: 'var(--linear-hero-glow)' }}
      />

      <div className='relative w-full py-16 lg:py-20'>
        <h1
          style={{
            fontSize: 'clamp(40px, calc(20px + 3.5vw), 64px)',
            fontWeight: 510,
            lineHeight: 1,
            letterSpacing: '-0.022em',
            color: 'var(--linear-text-primary)',
            fontFeatureSettings: '"cv01", "ss03", "rlig" 1, "calt" 1',
            fontVariationSettings: '"opsz" 64',
          }}
        >
          <span className='whitespace-nowrap'>Your entire music career.</span>
          <br />
          <span
            style={{
              background:
                'linear-gradient(to right, var(--linear-hero-gradient-from), var(--linear-hero-gradient-to))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            One intelligent link.
          </span>
        </h1>

        <p
          className='mt-5 max-w-[440px]'
          style={{
            fontSize: '15px',
            fontWeight: 400,
            lineHeight: '24px',
            letterSpacing: '-0.011em',
            color: 'var(--linear-text-secondary)',
          }}
        >
          Jovie builds your link-in-bio from Spotify in 30 seconds — with smart
          links for every release, automatic email capture, and fan retargeting
          built in.
        </p>

        <div className='mt-10 max-w-[440px]'>
          <HeroSpotifySearch />
        </div>

        <p
          className='mt-5 flex items-center gap-2'
          style={{
            fontSize: '13px',
            letterSpacing: '0.01em',
            color: 'var(--linear-text-tertiary)',
          }}
        >
          <span
            aria-hidden='true'
            className='inline-block h-1.5 w-1.5 rounded-full bg-emerald-500/80'
          />{' '}
          Free forever. No credit card.
        </p>
      </div>
    </section>
  );
}
