'use client';

import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ArtistName } from '@/components/atoms/ArtistName';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { Avatar } from '@/components/molecules/Avatar';
import { PhoneFrame } from './PhoneFrame';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MOCK_ARTIST = {
  name: 'Tim White',
  handle: 'timwhite',
  image:
    'https://egojgbuon2z2yahy.public.blob.vercel-storage.com/avatars/users/user_38SPgR24re2YSaXT2hVoFtvvlVy/tim-white-profie-pic-e2f4672b-3555-4a63-9fe6-f0d5362218f6.avif',
  isVerified: true,
} as const;

const CTA_CLASS =
  'inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-btn-primary px-8 py-3 text-[13px] font-semibold text-btn-primary-foreground shadow-sm';

const CONTENT_HEIGHT = 196;
const AUTO_ADVANCE_MS = 3500;

/* ------------------------------------------------------------------ */
/*  Mode content panels                                                */
/* ------------------------------------------------------------------ */

const MODES = ['profile', 'tour', 'tip', 'listen'] as const;

const MOCK_TOUR_DATES = [
  { city: 'Atlanta, GA', venue: 'The Masquerade', date: 'Mar 22' },
  { city: 'Nashville, TN', venue: 'Exit/In', date: 'Mar 28' },
  { city: 'Austin, TX', venue: 'Mohawk', date: 'Apr 4' },
] as const;

function ListenContent() {
  const dsps = [
    { platform: 'spotify', label: 'Spotify' },
    { platform: 'applemusic', label: 'Apple Music' },
    { platform: 'youtube', label: 'YouTube' },
  ] as const;
  return (
    <div className='flex h-full flex-col justify-center gap-2'>
      {dsps.map(dsp => (
        <button key={dsp.platform} type='button' className={CTA_CLASS}>
          <SocialIcon platform={dsp.platform} size={16} aria-hidden />
          {dsp.label}
        </button>
      ))}
    </div>
  );
}

function TipContent() {
  return (
    <div className='flex h-full flex-col justify-center gap-3'>
      <p className='text-[10px] font-medium uppercase tracking-[0.15em] text-tertiary-token'>
        Choose amount
      </p>
      <div className='grid grid-cols-3 gap-2'>
        {([3, 5, 10] as const).map((amount, i) => (
          <div
            key={amount}
            className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border text-center ${
              i === 1
                ? 'border-transparent bg-btn-primary text-btn-primary-foreground shadow-sm'
                : 'border-default bg-surface-1 text-primary-token'
            }`}
          >
            <span
              className={`text-[10px] font-medium uppercase tracking-wider ${
                i === 1
                  ? 'text-btn-primary-foreground/70'
                  : 'text-secondary-token'
              }`}
            >
              USD
            </span>
            <span className='text-xl font-semibold tabular-nums tracking-tight'>
              ${amount}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TourContent() {
  return (
    <div className='flex h-full flex-col justify-center gap-2'>
      {MOCK_TOUR_DATES.map(show => (
        <div
          key={show.city}
          className='flex w-full items-center justify-between rounded-xl border border-subtle bg-surface-1 px-4 py-3'
        >
          <div className='min-w-0'>
            <p className='text-[13px] font-medium text-primary-token truncate'>
              {show.venue}
            </p>
            <p className='text-[11px] text-tertiary-token'>{show.city}</p>
          </div>
          <span className='shrink-0 text-[11px] font-medium text-secondary-token'>
            {show.date}
          </span>
        </div>
      ))}
    </div>
  );
}

function ProfileContent() {
  const platforms = ['instagram', 'spotify', 'youtube', 'tiktok'] as const;
  return (
    <div className='flex h-full flex-col justify-center gap-4'>
      <button type='button' className={CTA_CLASS}>
        Turn on notifications
      </button>
      <div className='flex items-center justify-center gap-1.5'>
        {platforms.map(p => (
          <span
            key={p}
            className='inline-flex h-10 w-10 items-center justify-center rounded-full text-secondary-token'
          >
            <SocialIcon platform={p} size={18} aria-hidden />
          </span>
        ))}
      </div>
    </div>
  );
}

const MODE_CONTENT: Record<string, React.ReactNode> = {
  listen: <ListenContent />,
  tip: <TipContent />,
  tour: <TourContent />,
  profile: <ProfileContent />,
};

/* ------------------------------------------------------------------ */
/*  Hero phone — auto-advancing modes                                  */
/* ------------------------------------------------------------------ */

export function HeroProfilePreview() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex(prev => (prev + 1) % MODES.length);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className='relative flex flex-col items-center'>
      <PhoneFrame>
        {/* Nav bar */}
        <div className='flex items-center justify-end px-4 pt-10 pb-1'>
          <CircleIconButton size='xs' variant='ghost' ariaLabel='Notifications'>
            <Bell className='h-4 w-4' />
          </CircleIconButton>
        </div>

        {/* Artist identity */}
        <div className='flex flex-col items-center px-5 pb-2'>
          <div className='rounded-full p-[2px] ring-1 ring-white/6 shadow-sm'>
            <Avatar
              src={MOCK_ARTIST.image}
              alt={MOCK_ARTIST.name}
              name={MOCK_ARTIST.name}
              size='display-md'
              priority
              verified={false}
            />
          </div>
          <div className='mt-2.5 text-center'>
            <ArtistName
              name={MOCK_ARTIST.name}
              handle={MOCK_ARTIST.handle}
              isVerified={MOCK_ARTIST.isVerified}
              size='md'
              showLink={false}
              as='p'
            />
            <p className='mt-0.5 text-[11px] text-secondary-token tracking-[0.2em] uppercase'>
              Artist
            </p>
          </div>
        </div>

        {/* Mode dots */}
        <div className='flex items-center justify-center gap-1.5 py-2.5'>
          {MODES.map((mode, i) => (
            <div
              key={mode}
              className='rounded-full transition-all duration-[var(--linear-duration-slow)] ease-[var(--linear-ease)]'
              style={{
                width: i === activeIndex ? 16 : 6,
                height: 6,
                backgroundColor:
                  i === activeIndex
                    ? 'rgb(247,248,248)'
                    : 'rgba(255,255,255,0.2)',
              }}
            />
          ))}
        </div>

        {/* Content — crossfade between modes */}
        <div
          className='relative overflow-hidden'
          style={{ height: CONTENT_HEIGHT }}
        >
          {MODES.map((mode, i) => (
            <div
              key={mode}
              className='absolute inset-0 px-5 transition-opacity duration-500 ease-[cubic-bezier(0.33,.01,.27,1)]'
              style={{
                opacity: i === activeIndex ? 1 : 0,
                pointerEvents: i === activeIndex ? 'auto' : 'none',
              }}
            >
              {MODE_CONTENT[mode]}
            </div>
          ))}
        </div>

        {/* Branding */}
        <div className='pb-3 pt-1 text-center'>
          <p className='text-[9px] uppercase tracking-[0.15em] text-tertiary-token/40'>
            Powered by Jovie
          </p>
        </div>
      </PhoneFrame>
    </div>
  );
}
