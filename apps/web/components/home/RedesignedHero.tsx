import { HeroSpotifySearch } from './HeroSpotifySearch';

/**
 * RedesignedHero — Split hero with left copy + right profile mockup.
 * Linear.app-inspired: generous whitespace, premium shadows, high-fidelity product UI.
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

      <div className='relative mx-auto grid w-full max-w-[1200px] grid-cols-1 items-center gap-10 py-16 lg:grid-cols-[1fr,380px] lg:gap-16 lg:py-20'>
        {/* ---- Left column: Copy + CTA ---- */}
        <div>
          <h1
            className='text-balance'
            style={{
              maxWidth: '560px',
              fontSize: 'clamp(40px, calc(20px + 3.5vw), 64px)',
              fontWeight: 510,
              lineHeight: 1,
              letterSpacing: '-0.022em',
              color: 'var(--linear-text-primary)',
              fontFeatureSettings: '"cv01", "ss03", "rlig" 1, "calt" 1',
              fontVariationSettings: '"opsz" 64',
            }}
          >
            Your entire music career.
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
        <div className='relative hidden lg:block'>
          <HeroProfileMockup />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  SVG icon components for social platforms                           */
/* ------------------------------------------------------------------ */

function SpotifyIcon() {
  return (
    <svg
      aria-hidden='true'
      width='14'
      height='14'
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
      width='14'
      height='14'
      viewBox='0 0 24 24'
      fill='currentColor'
    >
      <path d='M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.802.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03c.525 0 1.048-.034 1.57-.1.823-.106 1.597-.35 2.296-.81a5.046 5.046 0 001.88-2.207c.186-.42.293-.862.358-1.31.083-.567.12-1.137.125-1.708V6.124zm-6.423 4.87v5.525c0 .386-.047.762-.212 1.115-.253.543-.714.833-1.28.927-.464.077-.927.075-1.375-.077-.607-.207-.986-.672-1.058-1.31-.07-.622.222-1.18.787-1.46.302-.148.63-.232.958-.302.328-.07.66-.128.982-.22.164-.048.308-.13.385-.3.05-.112.068-.235.07-.36V11.35a.459.459 0 00-.392-.467c-.15-.027-.302-.04-.454-.058l-3.968-.498a.465.465 0 00-.536.39c-.01.058-.013.12-.013.178v7.58c0 .393-.044.776-.212 1.134-.262.554-.724.842-1.3.93-.453.07-.906.066-1.345-.082-.622-.208-1-.677-1.068-1.328-.065-.613.226-1.16.78-1.44.3-.15.627-.233.955-.305.33-.072.662-.13.985-.222.16-.045.306-.126.383-.294.052-.116.072-.242.074-.37V8.472c0-.27.072-.512.29-.686.146-.117.317-.18.498-.213a2.88 2.88 0 01.447-.045l4.762.59c.36.044.685.177.895.499.097.147.138.316.14.49z' />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg
      aria-hidden='true'
      width='14'
      height='14'
      viewBox='0 0 24 24'
      fill='currentColor'
    >
      <path d='M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z' />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg
      aria-hidden='true'
      width='14'
      height='14'
      viewBox='0 0 24 24'
      fill='currentColor'
    >
      <path d='M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z' />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg
      aria-hidden='true'
      width='14'
      height='14'
      viewBox='0 0 24 24'
      fill='currentColor'
    >
      <path d='M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z' />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  High-fidelity profile mockup — Linear.app-inspired floating card   */
/* ------------------------------------------------------------------ */

function HeroProfileMockup() {
  return (
    <div className='flex flex-col items-center'>
      {/* Ambient glow — matches Linear's radial pattern */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute -inset-16'
        style={{
          background:
            'radial-gradient(50% 50% at 50% 40%, rgba(255,255,255,0.035) 0%, transparent 70%)',
        }}
      />

      {/* Cropped card viewport — top 2/3 with fade */}
      <div
        className='relative overflow-hidden'
        style={{
          height: 400,
          width: 340,
          perspective: '1000px',
          perspectiveOrigin: '50% 40%',
        }}
      >
        <div
          className='relative w-[340px] overflow-hidden'
          style={{
            backgroundColor: 'rgb(16, 17, 18)',
            borderRadius: '20px',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: [
              '0 4px 32px rgba(8,9,10,0.6)',
              '0 12px 48px rgba(0,0,0,0.4)',
            ].join(', '),
            transform: 'rotateY(-4deg) rotateX(2deg)',
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Shine border overlay */}
          <div
            aria-hidden='true'
            className='pointer-events-none absolute inset-0'
            style={{
              borderRadius: '20px',
              border: '1px solid rgb(56, 59, 63)',
              zIndex: 5,
            }}
          />
          {/* Top edge highlight */}
          <div
            aria-hidden='true'
            className='pointer-events-none absolute inset-x-0 top-0 h-px'
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(255,255,255,0.12) 30%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.12) 70%, transparent)',
              zIndex: 6,
            }}
          />

          {/* Top bar — browser/app chrome */}
          <div
            className='flex items-center justify-between px-5 pb-2 pt-4'
            style={{ fontSize: '11px', color: 'rgba(255,255,255,0.28)' }}
          >
            <span style={{ fontWeight: 500, letterSpacing: '0.02em' }}>
              jov.ie/timwhitemusic
            </span>
            <div className='flex items-center gap-1.5'>
              <div
                className='h-[5px] w-[5px] rounded-full'
                style={{ backgroundColor: 'rgba(74,222,128,0.6)' }}
              />
              <span style={{ fontSize: '10px', fontWeight: 500 }}>Live</span>
            </div>
          </div>

          {/* Profile content */}
          <div className='flex flex-col items-center px-7 pb-10 pt-4'>
            {/* Avatar */}
            <div
              className='relative overflow-hidden rounded-full'
              style={{
                width: 80,
                height: 80,
                background:
                  'linear-gradient(145deg, #2a1f3d, #1a1a2e, #1f2d1a)',
                boxShadow: [
                  '0 0 0 3px rgba(255,255,255,0.05)',
                  '0 8px 32px rgba(0,0,0,0.5)',
                  '0 2px 8px rgba(0,0,0,0.3)',
                ].join(', '),
              }}
            >
              <div className='flex h-full w-full items-center justify-center text-2xl font-semibold text-white/90'>
                T
              </div>
            </div>

            {/* Name + verified */}
            <div className='mt-3.5 flex items-center gap-1.5'>
              <span
                style={{
                  fontSize: '17px',
                  fontWeight: 500,
                  color: 'rgba(247,248,248,0.95)',
                  letterSpacing: '-0.015em',
                }}
              >
                Tim White
              </span>
              {/* Verified badge */}
              <svg
                aria-hidden='true'
                width='16'
                height='16'
                viewBox='0 0 24 24'
                className='shrink-0'
              >
                <path
                  d='M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z'
                  fill='#5B8DEF'
                />
              </svg>
            </div>

            {/* Subtitle */}
            <span
              style={{
                fontSize: '11px',
                color: 'rgba(255,255,255,0.3)',
                marginTop: '3px',
                textTransform: 'uppercase' as const,
                letterSpacing: '0.1em',
                fontWeight: 500,
              }}
            >
              Music Artist
            </span>

            {/* CTA button */}
            <div
              className='mt-6 flex w-full items-center justify-center rounded-full'
              style={{
                height: 42,
                fontSize: '13px',
                fontWeight: 500,
                color: 'rgb(8,9,10)',
                backgroundColor: 'rgb(232,232,232)',
                letterSpacing: '-0.005em',
                boxShadow:
                  '0 1px 2px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.2)',
              }}
            >
              Listen Now
            </div>

            {/* Email capture hint */}
            <div
              className='mt-2.5 flex w-full items-center gap-2.5'
              style={{
                backgroundColor: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.04)',
                borderRadius: '12px',
                padding: '10px 14px',
              }}
            >
              <svg
                aria-hidden='true'
                width='14'
                height='14'
                viewBox='0 0 24 24'
                fill='none'
                stroke='rgba(255,255,255,0.22)'
                strokeWidth='1.5'
              >
                <path d='M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75' />
              </svg>
              <span
                style={{
                  fontSize: '12px',
                  color: 'rgba(255,255,255,0.26)',
                  fontWeight: 400,
                }}
              >
                Get notified on new releases
              </span>
            </div>

            {/* Social links row */}
            <div className='mt-5 flex items-center gap-2'>
              {[
                { name: 'Spotify', icon: <SpotifyIcon /> },
                { name: 'Apple Music', icon: <AppleMusicIcon /> },
                { name: 'YouTube', icon: <YouTubeIcon /> },
                { name: 'Instagram', icon: <InstagramIcon /> },
                { name: 'TikTok', icon: <TikTokIcon /> },
              ].map(platform => (
                <div
                  key={platform.name}
                  className='flex items-center justify-center rounded-full'
                  style={{
                    width: 30,
                    height: 30,
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.04)',
                    color: 'rgba(255,255,255,0.28)',
                  }}
                >
                  {platform.icon}
                </div>
              ))}
            </div>

            {/* Powered by badge */}
            <div
              className='mt-5 flex items-center gap-1.5'
              style={{
                fontSize: '10px',
                color: 'rgba(255,255,255,0.16)',
                fontWeight: 450,
                letterSpacing: '0.02em',
              }}
            >
              <svg
                aria-hidden='true'
                width='10'
                height='10'
                viewBox='0 0 24 24'
                fill='rgba(255,255,255,0.16)'
              >
                <path d='M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' />
              </svg>
              <span>jovie.link</span>
            </div>
          </div>

          {/* Bottom edge shadow for depth */}
          <div
            aria-hidden='true'
            className='pointer-events-none absolute inset-x-0 bottom-0 h-20'
            style={{
              background:
                'linear-gradient(to top, rgba(0,0,0,0.15), transparent)',
              borderRadius: '0 0 20px 20px',
            }}
          />
        </div>

        {/* Bottom fade — crop gradient */}
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
        jov.ie/tim
      </p>
    </div>
  );
}
