import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

/**
 * RedesignedHero - Linear.app style hero section
 * Matches Linear's homepage hero layout exactly
 */
export function RedesignedHero() {
  return (
    <section
      className='relative overflow-hidden'
      style={{
        minHeight: 'calc(100vh - 56px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '80px 24px 120px',
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
            You make the music.{' '}
            <span style={{ color: 'var(--linear-accent)' }}>
              We build the audience.
            </span>
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
            Jovie captures every fan who hits your link in bio, learns what
            makes them come back, and follows up while you sleep —
            compounding your audience so every release is bigger than the
            last.
          </p>

          {/* CTAs - Linear style with primary button and secondary link */}
          <div
            className='flex flex-col sm:flex-row items-center justify-center'
            style={{
              marginTop: '40px',
              gap: '16px',
            }}
          >
            {/* Primary CTA */}
            <Link
              href='/waitlist'
              className='inline-flex items-center justify-center transition-opacity hover:opacity-90'
              style={{
                height: '40px',
                padding: '0 20px',
                backgroundColor: 'var(--linear-btn-primary-bg)',
                color: 'var(--linear-btn-primary-fg)',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              Get started
            </Link>

            {/* Secondary CTA - Link style like Linear's "New: Feature" link */}
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
