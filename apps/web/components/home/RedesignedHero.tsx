import type { FeaturedCreator } from '@/lib/featured-creators';
import { getFeaturedCreators } from '@/lib/featured-creators';
import { HeroSpotifySearch } from './HeroSpotifySearch';
import { MobileProfilePreview } from './MobileProfilePreview';
import { PhoneFrame } from './PhoneFrame';

const FALLBACK_CREATOR: FeaturedCreator = {
  id: 'fallback',
  handle: 'tim',
  name: 'Tim White',
  src: '/images/hero/tim-profile.avif',
  genres: ['Artist'],
  latestReleaseTitle: 'Afterglow (Deluxe)',
  latestReleaseType: 'Album',
};

/**
 * RedesignedHero — F-layout hero: copy left, profile mockup right.
 * Linear.app-inspired: floating card with browser chrome, deep shadows, slight 3D tilt.
 */
export async function RedesignedHero() {
  let creators: FeaturedCreator[] = [];
  try {
    creators = await getFeaturedCreators();
  } catch {
    // Fall through to fallback
  }
  const featuredCreator = creators[0] ?? FALLBACK_CREATOR;

  return (
    <section className='relative flex flex-1 flex-col justify-center overflow-hidden px-5 sm:px-6 lg:px-[77px]'>
      {/* Ambient glow */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{ background: 'var(--linear-hero-glow)' }}
      />

      <div className='relative grid w-full grid-cols-1 items-center gap-10 py-12 md:grid-cols-[1fr_auto] md:gap-12 lg:gap-16 lg:py-16'>
        <div>
          <h1
            style={{
              fontSize: 'clamp(36px, calc(18px + 3.2vw), 56px)',
              fontWeight: 510,
              lineHeight: 1.05,
              letterSpacing: '-0.022em',
              color: 'var(--linear-text-primary)',
              fontFeatureSettings: '"cv01", "ss03", "rlig" 1, "calt" 1',
              fontVariationSettings: '"opsz" 56',
            }}
          >
            One-click artist profiles
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
              that actually convert.
            </span>
          </h1>

          <p
            className='mt-4 max-w-[400px]'
            style={{
              fontSize: '15px',
              fontWeight: 400,
              lineHeight: '24px',
              letterSpacing: '-0.011em',
              color: 'var(--linear-text-secondary)',
            }}
          >
            Your entire music career. One link. Ready in seconds.
          </p>

          <div className='mt-8 max-w-[400px]'>
            <HeroSpotifySearch />
          </div>

          <p
            className='mt-4 flex items-center gap-2'
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

        <div className='relative hidden md:flex md:flex-col md:items-center'>
          <HeroProfileMockup creator={featuredCreator} />
        </div>
      </div>
    </section>
  );
}

function HeroProfileMockup({ creator }: { readonly creator: FeaturedCreator }) {
  return (
    <div className='flex flex-col items-center'>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute -inset-20'
        style={{
          background:
            'radial-gradient(50% 50% at 50% 40%, rgba(255,255,255,0.03) 0%, transparent 70%)',
        }}
      />

      <div
        className='relative overflow-hidden'
        style={{
          height: 440,
          width: 300,
          perspective: '1200px',
          perspectiveOrigin: '50% 40%',
        }}
      >
        <div
          style={{
            transform: 'rotateY(-3deg) rotateX(1deg)',
            transformStyle: 'preserve-3d',
          }}
        >
          <PhoneFrame>
            <MobileProfilePreview creator={creator} />
          </PhoneFrame>
        </div>

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

      <div
        className='mt-3 rounded-full border px-3 py-1.5'
        style={{
          borderColor: 'var(--linear-border-subtle)',
          background: 'rgba(255, 255, 255, 0.02)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
        }}
      >
        <p
          style={{
            fontSize: '12px',
            fontWeight: 500,
            letterSpacing: '-0.005em',
            color: 'var(--linear-text-secondary)',
          }}
        >
          jov.ie/{creator.handle}
        </p>
      </div>
    </div>
  );
}
