import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { HeroSpotifySearch } from './HeroSpotifySearch';

/**
 * RedesignedHero - Linear.app style hero section
 * Matches Linear's homepage hero layout exactly
 */
export function RedesignedHero() {
  return (
    <section
      className='relative overflow-hidden'
      style={{
        minHeight: 'calc(100dvh - 56px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding:
          'clamp(40px, 8vw, 80px) clamp(16px, 4vw, 24px) clamp(60px, 10vw, 120px)',
      }}
    >
      <div
        className='relative z-10 mx-auto w-full'
        style={{ maxWidth: '1200px' }}
      >
        <div className='text-center'>
          {/* H1 - Large centered headline like Linear */}
          <h1
            className='text-balance mx-auto'
            style={{
              maxWidth: '900px',
              fontSize: 'clamp(36px, 5.5vw, 56px)',
              fontWeight: 500,
              lineHeight: 1.1,
              letterSpacing: '-0.022em',
              color: 'var(--linear-text-primary)',
            }}
          >
            The link in bio built for artists who want real fan relationships
          </h1>

          {/* Subheading - matches Linear's lead paragraph */}
          <p
            className='mx-auto'
            style={{
              maxWidth: '560px',
              marginTop: '24px',
              fontSize: 'var(--linear-h4-size)',
              fontWeight: 400,
              lineHeight: 1.6,
              color: 'var(--linear-text-secondary)',
            }}
          >
            Capture fan contacts, guide visitors to the right listening link,
            and grow your owned audience without adding complexity to your
            release workflow.
          </p>

          {/* Spotify Search CTA */}
          <div style={{ marginTop: '40px' }}>
            <HeroSpotifySearch />
          </div>

          {/* Secondary CTA */}
          <div style={{ marginTop: '16px' }}>
            <Link
              href='#how-it-works'
              className='inline-flex items-center transition-opacity hover:opacity-70'
              style={{
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--linear-text-secondary)',
                gap: '6px',
              }}
            >
              <span>See how it works</span>
              <ArrowRight
                className='transition-transform group-hover:translate-x-0.5'
                style={{ width: '14px', height: '14px' }}
              />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
