import { HeroSpotifySearch } from './HeroSpotifySearch';

/**
 * RedesignedHero - Clean, left-aligned hero section
 */
export function RedesignedHero() {
  return (
    <section className='relative overflow-hidden px-5 pb-16 pt-16 sm:px-6 md:pb-24 md:pt-36 lg:px-[77px]'>
      {/* Ambient glow — subtle depth cue behind content */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 25% 35%, oklch(22% 0.025 260 / 0.5), transparent 70%)',
        }}
      />

      <div className='relative w-full'>
        {/* H1 - Left-aligned headline */}
        <h1
          className='text-balance'
          style={{
            maxWidth: '640px',
            fontSize: 'clamp(32px, calc(16px + 3.5vw), 56px)',
            fontWeight: 500,
            lineHeight: 1.1,
            letterSpacing: '-0.025em',
            color: 'var(--linear-text-primary)',
            fontFeatureSettings: '"cv01", "ss03", "rlig" 1, "calt" 1',
            fontVariationSettings: '"opsz" 56',
          }}
        >
          Your entire music career.
          <br />
          <span
            style={{
              background:
                'linear-gradient(to right, oklch(72% 0.015 260), oklch(58% 0.01 260))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            One intelligent link.
          </span>
        </h1>

        {/* Subheading */}
        <p
          style={{
            maxWidth: '460px',
            marginTop: '24px',
            fontSize: '15px',
            fontWeight: 400,
            lineHeight: 1.65,
            letterSpacing: '0.005em',
            color: 'oklch(66% 0.01 260)',
          }}
        >
          Jovie builds your link-in-bio from Spotify in 30 seconds — with smart
          links for every release, automatic email capture, and fan retargeting
          built in.
        </p>

        {/* Spotify Search CTA */}
        <div className='mt-10 max-w-[440px]'>
          <HeroSpotifySearch />
        </div>

        {/* Trust line */}
        <p
          className='mt-5'
          style={{
            fontSize: '13px',
            letterSpacing: '0.01em',
            color: 'oklch(56% 0.008 260)',
          }}
        >
          Free forever. No credit card.
        </p>
      </div>
    </section>
  );
}
