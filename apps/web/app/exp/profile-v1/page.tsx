'use client';

import Link from 'next/link';

// ---------------------------------------------------------------------------
// MOCK DATA — Bahamas (Toronto indie folk)
// ---------------------------------------------------------------------------
const ARTIST = {
  name: 'Bahamas',
  handle: '@bahamasmusic',
  bio: 'Toronto indie folk. Songs about people.',
  location: 'Toronto, ON',
  initials: 'BH',
};

const SMART_LINKS: { label: string; url: string }[] = [
  { label: 'Spotify', url: '#' },
  { label: 'Apple Music', url: '#' },
  { label: 'YouTube', url: '#' },
  { label: 'TikTok', url: '#' },
  { label: 'Mailing List', url: '#' },
];

const TOP_TRACKS: { title: string; duration: string; plays: string }[] = [
  { title: 'Lost in the Light', duration: '3:52', plays: '28.4M' },
  { title: 'Stronger Than That', duration: '3:41', plays: '12.1M' },
  { title: 'All the Time', duration: '4:07', plays: '9.8M' },
  { title: 'Sunshine on My Back', duration: '3:29', plays: '7.2M' },
  { title: 'Bittersweet', duration: '3:58', plays: '5.6M' },
];

// ---------------------------------------------------------------------------
// SHARED ICONS
// ---------------------------------------------------------------------------
function SpotifyIcon() {
  return (
    <svg
      viewBox='0 0 24 24'
      fill='currentColor'
      className='h-4 w-4'
      aria-hidden='true'
    >
      <title>Spotify</title>
      <path d='M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.52 17.28c-.21.33-.66.43-.98.22-2.69-1.64-6.07-2.01-10.07-1.1-.38.09-.77-.15-.86-.53-.09-.38.15-.77.53-.86 4.37-.99 8.11-.57 11.14 1.27.32.21.43.66.24.98v.02zm1.47-3.27c-.27.42-.84.55-1.25.28-3.07-1.89-7.76-2.43-11.39-1.33-.48.14-.98-.13-1.12-.61-.14-.48.13-.98.61-1.12 4.15-1.26 9.32-.64 12.87 1.52.42.27.55.84.28 1.26zm.13-3.4C15.85 8.12 9.84 7.92 6.24 9.04c-.57.17-1.17-.14-1.34-.71-.17-.57.14-1.17.71-1.34 4.12-1.25 10.97-1.01 15.3 1.55.52.3.7 1 .39 1.52-.3.52-1 .7-1.52.39l.04.04z' />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg
      viewBox='0 0 24 24'
      fill='currentColor'
      className='h-4 w-4'
      aria-hidden='true'
    >
      <title>Apple Music</title>
      <path d='M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z' />
    </svg>
  );
}

function YoutubeIcon() {
  return (
    <svg
      viewBox='0 0 24 24'
      fill='currentColor'
      className='h-4 w-4'
      aria-hidden='true'
    >
      <title>YouTube</title>
      <path d='M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z' />
    </svg>
  );
}

function TiktokIcon() {
  return (
    <svg
      viewBox='0 0 24 24'
      fill='currentColor'
      className='h-4 w-4'
      aria-hidden='true'
    >
      <title>TikTok</title>
      <path d='M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.87a8.22 8.22 0 004.83 1.55V7a4.85 4.85 0 01-1.06-.31z' />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth={1.5}
      className='h-4 w-4'
      aria-hidden='true'
    >
      <title>Mailing list</title>
      <path d='M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75' />
    </svg>
  );
}

const LINK_ICONS: Record<string, React.ReactNode> = {
  Spotify: <SpotifyIcon />,
  'Apple Music': <AppleIcon />,
  YouTube: <YoutubeIcon />,
  TikTok: <TiktokIcon />,
  'Mailing List': <MailIcon />,
};

// ---------------------------------------------------------------------------
// VARIANT A — Cinematic poster
// ---------------------------------------------------------------------------
function VariantA() {
  return (
    <div
      className='relative flex flex-col overflow-hidden rounded-xl'
      style={{ height: 480, width: '100%', background: '#0a0a0a' }}
    >
      <div
        className='absolute inset-0'
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(80,70,55,0.7) 0%, rgba(10,10,10,0) 70%)',
        }}
      />
      <div className='relative z-10 flex flex-col items-center pt-10'>
        <div
          className='flex items-center justify-center rounded-full'
          style={{
            width: 72,
            height: 72,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            fontSize: 22,
            fontWeight: 590,
            color: '#E3E4E6',
            letterSpacing: '-0.02em',
          }}
        >
          {ARTIST.initials}
        </div>
      </div>

      <div className='relative z-10 mt-auto px-6 pb-2'>
        <p
          style={{
            fontSize: 52,
            fontWeight: 680,
            letterSpacing: '-0.03em',
            lineHeight: 1.0,
            color: '#FFFFFF',
          }}
        >
          {ARTIST.name}
        </p>
        <p
          style={{
            fontSize: 13,
            fontWeight: 400,
            color: '#969799',
            marginTop: 6,
          }}
        >
          {ARTIST.bio}
        </p>
      </div>

      <div
        className='relative z-10 mx-4 mb-4 mt-3 flex items-center justify-between rounded-xl px-4 py-3'
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(16px)',
        }}
      >
        {SMART_LINKS.map(link => (
          <a
            key={link.label}
            href={link.url}
            title={link.label}
            className='flex flex-col items-center gap-1 transition-opacity hover:opacity-70'
            style={{ color: '#E3E4E6' }}
          >
            {LINK_ICONS[link.label]}
            <span
              style={{
                fontSize: 9,
                fontWeight: 500,
                color: '#62666d',
              }}
            >
              {link.label === 'Mailing List' ? 'Newsletter' : link.label}
            </span>
          </a>
        ))}
      </div>

      <div className='relative z-10 px-5 pb-2'>
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.06)',
            paddingTop: 10,
          }}
        >
          {TOP_TRACKS.slice(0, 3).map((track, i) => (
            <div
              key={track.title}
              className='flex items-center justify-between py-1'
            >
              <div className='flex items-center gap-3'>
                <span
                  style={{
                    fontSize: 11,
                    color: '#62666d',
                    width: 14,
                    textAlign: 'right',
                  }}
                >
                  {i + 1}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 450,
                    color: '#E3E4E6',
                  }}
                >
                  {track.title}
                </span>
              </div>
              <span
                style={{
                  fontSize: 12,
                  color: '#62666d',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {track.duration}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VARIANT B — Brutalist editorial
// ---------------------------------------------------------------------------
function VariantB() {
  return (
    <div
      className='flex flex-col overflow-hidden'
      style={{ height: 480, width: '100%', background: '#F5F3EE' }}
    >
      <div
        style={{
          borderBottom: '3px solid #0c0c0c',
          padding: '16px 20px 12px',
        }}
      >
        <div className='flex items-baseline justify-between'>
          <p
            style={{
              fontSize: 11,
              fontWeight: 510,
              letterSpacing: '0.12em',
              color: '#0c0c0c',
              textTransform: 'uppercase',
            }}
          >
            Artist Profile
          </p>
          <p
            style={{
              fontSize: 11,
              fontWeight: 400,
              color: '#5a5b5d',
            }}
          >
            {ARTIST.location}
          </p>
        </div>
        <p
          style={{
            fontSize: 46,
            fontWeight: 680,
            letterSpacing: '-0.03em',
            lineHeight: 0.95,
            color: '#0c0c0c',
            marginTop: 6,
          }}
        >
          {ARTIST.name.toUpperCase()}
        </p>
        <p
          style={{
            fontSize: 13,
            fontWeight: 400,
            color: '#2e2f31',
            marginTop: 6,
            lineHeight: 1.4,
          }}
        >
          {ARTIST.bio}
        </p>
      </div>

      <div style={{ borderBottom: '1px solid #0c0c0c', display: 'flex' }}>
        {SMART_LINKS.map((link, i) => (
          <a
            key={link.label}
            href={link.url}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '9px 4px',
              fontSize: 10,
              fontWeight: 590,
              letterSpacing: '0.06em',
              color: '#0c0c0c',
              borderRight:
                i < SMART_LINKS.length - 1 ? '1px solid #0c0c0c' : 'none',
              textDecoration: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span style={{ color: '#2e2f31' }}>{LINK_ICONS[link.label]}</span>
            <span>
              {link.label === 'Mailing List'
                ? 'MAIL'
                : link.label.toUpperCase()}
            </span>
          </a>
        ))}
      </div>

      <div style={{ padding: '0 20px', flex: 1, overflow: 'hidden' }}>
        <p
          style={{
            fontSize: 10,
            fontWeight: 590,
            letterSpacing: '0.10em',
            color: '#5a5b5d',
            paddingTop: 12,
            paddingBottom: 6,
            borderBottom: '1px solid rgba(0,0,0,0.12)',
          }}
        >
          TRACKS
        </p>
        {TOP_TRACKS.map((track, i) => (
          <div
            key={track.title}
            className='flex items-baseline justify-between'
            style={{
              padding: '7px 0',
              borderBottom: '1px solid rgba(0,0,0,0.07)',
            }}
          >
            <div className='flex items-baseline gap-3'>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 510,
                  color: '#5a5b5d',
                  width: 14,
                  textAlign: 'right',
                }}
              >
                {i + 1}
              </span>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 510,
                  color: '#0c0c0c',
                  letterSpacing: '-0.01em',
                }}
              >
                {track.title}
              </span>
            </div>
            <span
              style={{
                fontSize: 11,
                color: '#9a9b9d',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {track.duration}
            </span>
          </div>
        ))}
      </div>

      <div style={{ borderTop: '3px solid #0c0c0c', display: 'flex' }}>
        <button
          type='button'
          style={{
            flex: 1,
            background: '#0c0c0c',
            color: '#F5F3EE',
            fontSize: 11,
            fontWeight: 590,
            letterSpacing: '0.08em',
            padding: '12px 0',
            border: 'none',
            cursor: 'pointer',
            borderRight: '1px solid #F5F3EE',
          }}
        >
          TIP BAHAMAS
        </button>
        <button
          type='button'
          style={{
            flex: 1,
            background: '#F5F3EE',
            color: '#0c0c0c',
            fontSize: 11,
            fontWeight: 590,
            letterSpacing: '0.08em',
            padding: '12px 0',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          JOIN MAILING LIST
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VARIANT C — Ambient glow
// ---------------------------------------------------------------------------
function VariantC() {
  return (
    <div
      className='flex flex-col items-center overflow-hidden'
      style={{
        height: 480,
        width: '100%',
        background: '#0d0e10',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 320,
          height: 200,
          background:
            'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(113,112,255,0.10) 0%, transparent 100%)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          marginTop: 40,
          width: 64,
          height: 64,
          borderRadius: 9999,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          fontWeight: 510,
          color: '#E3E4E6',
          letterSpacing: '-0.01em',
          position: 'relative',
        }}
      >
        {ARTIST.initials}
      </div>

      <div style={{ textAlign: 'center', marginTop: 16, padding: '0 24px' }}>
        <p
          style={{
            fontSize: 22,
            fontWeight: 590,
            letterSpacing: '-0.025em',
            color: '#FFFFFF',
            lineHeight: 1.1,
          }}
        >
          {ARTIST.name}
        </p>
        <p
          style={{
            fontSize: 13,
            fontWeight: 400,
            color: '#62666d',
            marginTop: 6,
            lineHeight: 1.5,
          }}
        >
          {ARTIST.bio}
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 6,
          marginTop: 20,
          flexWrap: 'wrap',
          justifyContent: 'center',
          padding: '0 16px',
        }}
      >
        {SMART_LINKS.map(link => (
          <a
            key={link.label}
            href={link.url}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 12px',
              borderRadius: 9999,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.07)',
              fontSize: 11,
              fontWeight: 450,
              color: '#969799',
              textDecoration: 'none',
              transition: 'background 150ms',
            }}
          >
            {LINK_ICONS[link.label]}
            <span>{link.label}</span>
          </a>
        ))}
      </div>

      <div style={{ width: '100%', padding: '20px 24px 0', flex: 1 }}>
        <p
          style={{
            fontSize: 10,
            fontWeight: 510,
            color: '#3a3b3d',
            letterSpacing: '0.08em',
            marginBottom: 10,
          }}
        >
          TOP TRACKS
        </p>
        {TOP_TRACKS.slice(0, 4).map((track, i) => (
          <div
            key={track.title}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '7px 0',
              borderTop:
                i === 0 ? '1px solid rgba(255,255,255,0.05)' : undefined,
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                style={{
                  fontSize: 11,
                  color: '#3a3b3d',
                  width: 12,
                  textAlign: 'right',
                }}
              >
                {i + 1}
              </span>
              <span style={{ fontSize: 13, fontWeight: 450, color: '#E3E4E6' }}>
                {track.title}
              </span>
            </div>
            <span
              style={{
                fontSize: 11,
                color: '#3a3b3d',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {track.duration}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          width: '100%',
          padding: '16px 24px 20px',
          display: 'flex',
          gap: 8,
        }}
      >
        <input
          type='email'
          placeholder='your@email.com'
          aria-label='Email for mailing list'
          style={{
            flex: 1,
            height: 36,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 9999,
            padding: '0 14px',
            fontSize: 12,
            color: '#E3E4E6',
            outline: 'none',
          }}
        />
        <button
          type='button'
          style={{
            height: 36,
            padding: '0 16px',
            borderRadius: 9999,
            background: '#e6e6e6',
            color: '#08090a',
            fontSize: 12,
            fontWeight: 590,
            border: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Follow
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VARIANT D — Music-first list
// ---------------------------------------------------------------------------
function VariantD() {
  return (
    <div
      className='flex flex-col overflow-hidden'
      style={{ height: 480, width: '100%', background: '#111214' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '16px 16px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 8,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.07)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            fontWeight: 510,
            color: '#E3E4E6',
            flexShrink: 0,
          }}
        >
          {ARTIST.initials}
        </div>
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              fontSize: 15,
              fontWeight: 590,
              color: '#FFFFFF',
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
            }}
          >
            {ARTIST.name}
          </p>
          <p
            style={{
              fontSize: 12,
              fontWeight: 400,
              color: '#62666d',
              marginTop: 2,
            }}
          >
            {ARTIST.bio}
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 4,
            marginLeft: 'auto',
            flexShrink: 0,
          }}
        >
          {SMART_LINKS.slice(0, 4).map(link => (
            <a
              key={link.label}
              href={link.url}
              title={link.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: 8,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.06)',
                color: '#969799',
                textDecoration: 'none',
              }}
            >
              {LINK_ICONS[link.label]}
            </a>
          ))}
        </div>
      </div>

      <div
        style={{
          padding: '12px 16px 4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 510,
            color: '#62666d',
            letterSpacing: '0.03em',
          }}
        >
          Popular
        </span>
        <span style={{ fontSize: 11, color: '#3a3b3d' }}>Plays</span>
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {TOP_TRACKS.map((track, i) => (
          <div
            key={track.title}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 16px',
            }}
          >
            <div
              style={{
                width: 20,
                textAlign: 'center',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: '#62666d',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {i + 1}
              </span>
            </div>

            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 6,
                background: `hsl(${220 + i * 25}, 15%, ${16 + i * 2}%)`,
                border: '1px solid rgba(255,255,255,0.05)',
                flexShrink: 0,
              }}
            />

            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 450,
                  color: '#E3E4E6',
                  letterSpacing: '-0.01em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {track.title}
              </p>
              <p style={{ fontSize: 11, color: '#62666d', marginTop: 1 }}>
                {ARTIST.name}
              </p>
            </div>

            <span
              style={{
                fontSize: 12,
                color: '#62666d',
                fontVariantNumeric: 'tabular-nums',
                marginRight: 8,
                flexShrink: 0,
              }}
            >
              {track.plays}
            </span>

            <span
              style={{
                fontSize: 12,
                color: '#3a3b3d',
                fontVariantNumeric: 'tabular-nums',
                flexShrink: 0,
              }}
            >
              {track.duration}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <button
          type='button'
          style={{
            flex: 1,
            height: 36,
            borderRadius: 9999,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#E3E4E6',
            fontSize: 12,
            fontWeight: 510,
            cursor: 'pointer',
          }}
        >
          Tip Bahamas
        </button>
        <button
          type='button'
          style={{
            flex: 1,
            height: 36,
            borderRadius: 9999,
            background: '#e6e6e6',
            border: 'none',
            color: '#08090a',
            fontSize: 12,
            fontWeight: 590,
            cursor: 'pointer',
          }}
        >
          Follow
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PAGE
// ---------------------------------------------------------------------------
const VARIANTS: {
  id: string;
  label: string;
  component: React.ComponentType;
}[] = [
  { id: 'A', label: 'A · Cinematic poster', component: VariantA },
  { id: 'B', label: 'B · Brutalist editorial', component: VariantB },
  { id: 'C', label: 'C · Ambient glow', component: VariantC },
  { id: 'D', label: 'D · Music-first list', component: VariantD },
];

export default function ProfileV1Page() {
  return (
    <div
      className='min-h-dvh w-full overflow-y-auto'
      style={{
        background: '#08090a',
        padding: '24px 0 48px',
      }}
    >
      <div
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          padding: '0 24px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 32,
          }}
        >
          <Link
            href='/exp/shell-v1'
            style={{
              fontSize: 12,
              fontWeight: 450,
              color: '#62666d',
              textDecoration: 'none',
            }}
          >
            ← shell-v1
          </Link>
          <span style={{ fontSize: 12, color: '#3a3b3d' }}>/</span>
          <span style={{ fontSize: 12, fontWeight: 450, color: '#969799' }}>
            Profile · 4 variants · Bahamas
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 32,
          }}
        >
          {VARIANTS.map(({ id, label, component: Component }) => (
            <div key={id}>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 510,
                  color: '#62666d',
                  letterSpacing: '0.04em',
                  marginBottom: 8,
                }}
              >
                {label}
              </p>
              <div
                style={{
                  borderRadius: 12,
                  overflow: 'hidden',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <Component />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
