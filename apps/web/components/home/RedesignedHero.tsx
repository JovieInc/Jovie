import { HeroSpotifySearch } from './HeroSpotifySearch';
import { MobileProfilePreview } from './MobileProfilePreview';
import { PhoneFrame } from './PhoneFrame';

/**
 * RedesignedHero — F-layout hero: copy left, profile mockup right.
 * Linear.app-inspired: floating card with browser chrome, deep shadows, slight 3D tilt.
 */
export function RedesignedHero() {
  return (
    <section className='relative flex flex-1 flex-col justify-center overflow-hidden px-5 sm:px-6 lg:px-[77px]'>
      {/* Ambient glow */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{ background: 'var(--linear-hero-glow)' }}
      />

      <div className='relative grid w-full grid-cols-1 items-center gap-12 py-16 md:grid-cols-[1fr,auto] md:gap-16 lg:gap-20 lg:py-20'>
        {/* ---- Left column: Copy + CTA ---- */}
        <div>
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
            Jovie builds your link-in-bio from Spotify in 30 seconds — with
            smart links for every release, automatic email capture, and fan
            retargeting built in.
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

        {/* ---- Right column: Profile mockup ---- */}
        <div className='relative hidden md:flex md:flex-col md:items-center'>
          <HeroProfileMockup />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Linear.app-style floating profile card                             */
/* ------------------------------------------------------------------ */

function HeroProfileMockup() {
  return (
    <div className='flex flex-col items-center'>
      {/* Ambient glow behind card */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute -inset-20'
        style={{
          background:
            'radial-gradient(50% 50% at 50% 40%, rgba(255,255,255,0.03) 0%, transparent 70%)',
        }}
      />

      {/* Cropped viewport — top 2/3 with bottom fade */}
      <div
        className='relative overflow-hidden'
        style={{
          height: 440,
          width: 300,
          perspective: '1200px',
          perspectiveOrigin: '50% 40%',
        }}
      >
        {/* The phone, slightly tilted like Linear's product shots */}
        <div
          style={{
            transform: 'rotateY(-3deg) rotateX(1deg)',
            transformStyle: 'preserve-3d',
          }}
        >
          <PhoneFrame>
            <MobileProfilePreview />
          </PhoneFrame>
        </div>

        {/* Bottom fade — crops into page background */}
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-x-0 bottom-0'
          style={{
            height: 100,
            background:
              'linear-gradient(to bottom, transparent, var(--linear-bg-page))',
          }}
        />
      </div>

      {/* URL label */}
      <p
        className='mt-3'
        style={{
          fontSize: '13px',
          fontWeight: 450,
          letterSpacing: '-0.005em',
          color: 'var(--linear-text-tertiary)',
        }}
      >
        jov.ie
      </p>
    </div>
  );
}
