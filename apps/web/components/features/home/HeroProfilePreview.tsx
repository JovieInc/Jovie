'use client';

import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ArtistName } from '@/components/atoms/ArtistName';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { Avatar } from '@/components/molecules/Avatar';
import { PhoneFrame } from './PhoneFrame';
import {
  MOCK_ARTIST,
  MODE_CONTENT,
  MODE_IDS,
  PHONE_CONTENT_HEIGHT,
} from './phone-mode-content';

const AUTO_ADVANCE_MS = 3500;

/* ------------------------------------------------------------------ */
/*  Hero phone — auto-advancing modes                                  */
/* ------------------------------------------------------------------ */

export function HeroProfilePreview() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex(prev => (prev + 1) % MODE_IDS.length);
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

        {/* Content — crossfade between modes */}
        <div
          className='relative overflow-hidden'
          style={{ height: PHONE_CONTENT_HEIGHT }}
        >
          {MODE_IDS.map((mode, i) => (
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
