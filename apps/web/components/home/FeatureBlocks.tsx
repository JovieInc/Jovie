import { Container } from '@/components/site/Container';
import type { FeaturedCreator } from '@/lib/featured-creators';
import { AutomaticReleaseSmartlinksSection } from './AutomaticReleaseSmartlinksSection';
import { MobileProfilePreview } from './MobileProfilePreview';
import { PhoneFrame } from './PhoneFrame';

/* ── Shared helpers ─────────────────────────────────────────────────────── */

function FeatureHeader({
  label,
  heading,
  description,
}: {
  readonly label: string;
  readonly heading: React.ReactNode;
  readonly description: string;
}) {
  return (
    <div className='grid gap-6 md:grid-cols-2 md:items-start'>
      <div>
        <p
          className='mb-3 uppercase'
          style={{
            fontSize: '13px',
            fontWeight: 510,
            letterSpacing: '0.08em',
            color: 'var(--linear-text-tertiary)',
          }}
        >
          {label}
        </p>
        <h2
          className='max-w-md'
          style={{
            color: 'var(--linear-text-primary)',
            fontSize: 'clamp(28px, 4vw, 48px)',
            fontWeight: 510,
            letterSpacing: '-0.022em',
            lineHeight: 1,
          }}
        >
          {heading}
        </h2>
      </div>
      <p
        className='max-w-lg'
        style={{
          color: 'var(--linear-text-secondary)',
          fontSize: '15px',
          lineHeight: '24px',
          letterSpacing: '-0.011em',
        }}
      >
        {description}
      </p>
    </div>
  );
}

function FeatureSeparator() {
  return (
    <div
      aria-hidden='true'
      className='mx-auto my-16 h-px max-w-2xl sm:my-20'
      style={{
        background:
          'linear-gradient(to right, transparent, var(--linear-separator-via), transparent)',
      }}
    />
  );
}

/* ── Block 3B: Artist Profiles ──────────────────────────────────────────── */

const SHOWCASE_CREATOR: FeaturedCreator = {
  id: 'showcase-creator',
  handle: 'tim',
  name: 'Tim White',
  src: '/images/avatars/placeholder.jpg',
  tagline: 'Nashville-bred indie singer-songwriter',
  genres: ['Indie', 'Alternative'],
  latestReleaseTitle: 'Never Say A Word',
  latestReleaseType: 'single',
};

function ProfileFeatureBlock() {
  return (
    <div className='grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-14'>
      {/* Left — text */}
      <FeatureHeader
        label='Artist Profiles'
        heading='Your corner of the internet.'
        description='A conversion-first artist profile that captures fan contacts and drives clear next actions — not a wall of links.'
      />

      {/* Right — cropped phone */}
      <div className='flex justify-center lg:justify-end'>
        <div className='flex flex-col items-center'>
          <div
            className='relative overflow-hidden'
            style={{ height: 400, width: 280 }}
          >
            <div style={{ height: 580 }}>
              <PhoneFrame>
                <MobileProfilePreview creator={SHOWCASE_CREATOR} />
              </PhoneFrame>
            </div>
            {/* Bottom fade */}
            <div
              aria-hidden='true'
              className='pointer-events-none absolute inset-x-0 bottom-0'
              style={{
                height: 80,
                background:
                  'linear-gradient(to bottom, transparent, var(--linear-bg-page))',
              }}
            />
          </div>
          <p
            className='mt-4'
            style={{
              fontSize: '14px',
              fontWeight: 450,
              letterSpacing: '-0.01em',
              color: 'var(--linear-text-tertiary)',
            }}
          >
            jov.ie/{SHOWCASE_CREATOR.handle}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Block 3C: Personalized Fan Experience ──────────────────────────────── */

function PersonalizedProfilePreview({
  platform,
}: {
  readonly platform: 'spotify' | 'apple-music';
}) {
  const isSpotify = platform === 'spotify';
  const ctaLabel = isSpotify ? 'Play on Spotify' : 'Play on Apple Music';
  const ctaColor = isSpotify ? 'rgb(30, 215, 96)' : 'rgb(252, 60, 68)';
  const fanLabel = isSpotify ? 'Spotify listener' : 'Apple Music fan';

  return (
    <div className='flex flex-col items-center'>
      {/* Fan label */}
      <p
        className='mb-3'
        style={{
          fontSize: '12px',
          fontWeight: 510,
          letterSpacing: '0.04em',
          color: 'var(--linear-text-tertiary)',
        }}
      >
        {fanLabel}
      </p>

      {/* Cropped phone */}
      <div
        className='relative overflow-hidden'
        style={{ height: 380, width: 240 }}
      >
        <div style={{ height: 580, width: 240 }}>
          <div
            className='relative mx-auto flex flex-col items-center'
            style={{ width: 240, height: 580 }}
          >
            {/* Scaled-down phone bezel */}
            <div
              className='relative h-full w-full overflow-hidden rounded-[34px] p-[3px]'
              style={{
                backgroundColor: 'rgb(18, 19, 20)',
                boxShadow: [
                  '0 0 0 1px rgba(255,255,255,0.08)',
                  '0 4px 32px rgba(8,9,10,0.6)',
                ].join(', '),
              }}
            >
              {/* Shine border */}
              <div
                aria-hidden='true'
                className='pointer-events-none absolute inset-0 rounded-[34px]'
                style={{
                  border: '1px solid rgb(56, 59, 63)',
                  zIndex: 5,
                }}
              />

              {/* Notch */}
              <div
                aria-hidden='true'
                className='absolute left-1/2 top-2 z-10 -translate-x-1/2'
                style={{
                  width: 68,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: 'rgb(8, 9, 10)',
                }}
              />

              {/* Inner screen */}
              <div
                className='relative h-full w-full overflow-hidden rounded-[31px]'
                style={{ backgroundColor: 'rgb(8, 9, 10)' }}
              >
                {/* Mini profile content */}
                <div className='flex h-full flex-col items-center'>
                  {/* Avatar */}
                  <div className='pt-10 pb-2'>
                    <div
                      className='overflow-hidden rounded-full'
                      style={{
                        boxShadow: '0 0 0 1px rgba(255,255,255,0.06)',
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={SHOWCASE_CREATOR.src}
                        alt={SHOWCASE_CREATOR.name}
                        className='h-14 w-14 rounded-full object-cover'
                        loading='lazy'
                      />
                    </div>
                  </div>

                  {/* Name */}
                  <p
                    className='text-[13px] font-semibold'
                    style={{ color: 'rgb(247, 248, 248)' }}
                  >
                    {SHOWCASE_CREATOR.name}
                  </p>
                  <p
                    className='mt-0.5 text-[10px] uppercase tracking-[0.2em]'
                    style={{ color: 'rgba(255, 255, 255, 0.4)' }}
                  >
                    {SHOWCASE_CREATOR.tagline}
                  </p>

                  {/* Platform CTA */}
                  <div className='mt-auto w-full px-4 pb-5'>
                    <div
                      className='flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold'
                      style={{
                        backgroundColor: ctaColor,
                        color: isSpotify
                          ? 'rgb(0, 0, 0)'
                          : 'rgb(255, 255, 255)',
                      }}
                    >
                      {isSpotify ? <SpotifyIcon /> : <AppleMusicIcon />}
                      {ctaLabel}
                    </div>
                  </div>
                </div>
              </div>

              {/* Home indicator */}
              <div
                aria-hidden='true'
                className='absolute bottom-1.5 left-1/2 -translate-x-1/2'
                style={{
                  width: 100,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: 'rgba(255, 255, 255, 0.15)',
                }}
              />
            </div>
          </div>
        </div>

        {/* Bottom fade */}
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-x-0 bottom-0'
          style={{
            height: 60,
            background:
              'linear-gradient(to bottom, transparent, var(--linear-bg-page))',
          }}
        />
      </div>
    </div>
  );
}

function SpotifyIcon() {
  return (
    <svg
      aria-hidden='true'
      width='16'
      height='16'
      viewBox='0 0 24 24'
      fill='currentColor'
    >
      <path d='M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z' />
    </svg>
  );
}

function AppleMusicIcon() {
  return (
    <svg
      aria-hidden='true'
      width='16'
      height='16'
      viewBox='0 0 24 24'
      fill='currentColor'
    >
      <path d='M23.994 6.124a9.23 9.23 0 0 0-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043A5.022 5.022 0 0 0 19.2.04a10.151 10.151 0 0 0-1.56-.04H6.36A10.15 10.15 0 0 0 4.8.04a5.02 5.02 0 0 0-2.374.852C1.308 1.61.563 2.61.246 3.92A9.23 9.23 0 0 0 .006 6.11v11.78a9.23 9.23 0 0 0 .24 2.19c.317 1.31 1.062 2.31 2.18 3.043a5.02 5.02 0 0 0 2.374.852c.52.04 1.04.04 1.56.04h11.28c.52 0 1.04 0 1.56-.04a5.02 5.02 0 0 0 2.374-.852c1.118-.732 1.863-1.732 2.18-3.043a9.23 9.23 0 0 0 .24-2.19V6.124zM16.94 17.5c0 .49-.07.96-.21 1.39-.2.58-.59 1.05-1.13 1.33-.37.2-.77.3-1.18.3-.12 0-.24-.01-.36-.03a2.11 2.11 0 0 1-1.16-.59 2.08 2.08 0 0 1-.59-1.49c0-.55.2-1.05.55-1.45.36-.41.84-.66 1.37-.73.26-.03.53-.05.8-.05h.05V9.56l-5.5 1.69v6.94c0 .49-.07.96-.21 1.39-.2.58-.59 1.05-1.13 1.33-.37.2-.77.3-1.18.3-.12 0-.24-.01-.36-.03a2.11 2.11 0 0 1-1.16-.59 2.08 2.08 0 0 1-.59-1.49c0-.55.2-1.05.55-1.45.36-.41.84-.66 1.37-.73.26-.03.53-.05.8-.05h.05V8.1c0-.35.22-.66.55-.77l6.8-2.08c.17-.05.35-.02.5.08.15.1.24.27.24.45v11.72z' />
    </svg>
  );
}

/* ── Main export ────────────────────────────────────────────────────────── */

export function FeatureBlocks() {
  return (
    <section
      className='section-spacing-linear'
      style={{ backgroundColor: 'var(--linear-bg-page)' }}
    >
      {/* Block 3A: SmartLinks — reuse existing component directly */}
      <AutomaticReleaseSmartlinksSection />

      <Container size='homepage'>
        <FeatureSeparator />

        {/* Block 3B: Artist Profiles */}
        <ProfileFeatureBlock />

        <FeatureSeparator />

        {/* Block 3C: Personalized Fan Experience */}
        <div className='mx-auto max-w-6xl'>
          <FeatureHeader
            label='Personalized Experience'
            heading='Every fan gets their perfect page.'
            description="Jovie detects each visitor's preferred streaming platform and personalizes the experience — Spotify listeners see Spotify first, Apple Music fans see Apple Music."
          />

          <div className='mt-10 flex flex-col items-center justify-center gap-8 sm:flex-row sm:gap-12'>
            <PersonalizedProfilePreview platform='spotify' />
            <PersonalizedProfilePreview platform='apple-music' />
          </div>
        </div>
      </Container>
    </section>
  );
}
