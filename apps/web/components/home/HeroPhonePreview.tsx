'use client';

import { Bell } from 'lucide-react';
import { ArtistName } from '@/components/atoms/ArtistName';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { Avatar } from '@/components/molecules/Avatar';
import { PhoneFrame } from './PhoneFrame';
import {
  MOCK_ARTIST,
  MODE_CONTENT,
  PHONE_CONTENT_HEIGHT,
} from './phone-mode-content';

interface HeroPhonePreviewProps {
  /** Handle of the featured artist, e.g. "tim" */
  readonly handle?: string;
}

/**
 * Hero phone — shows the real Jovie profile page (profile mode).
 * URL chip rendered below the phone frame as a caption.
 */
export function HeroPhonePreview({ handle }: HeroPhonePreviewProps) {
  const displayHandle = handle ?? MOCK_ARTIST.handle;

  return (
    <div className='flex flex-col items-center gap-4 lg:gap-5'>
      <div
        className='relative'
        style={{
          filter: 'drop-shadow(0 34px 58px rgba(0,0,0,0.4))',
        }}
      >
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-x-6 -bottom-10 top-16 rounded-full blur-3xl'
          style={{
            background:
              'radial-gradient(circle, rgba(84,96,255,0.18) 0%, rgba(84,96,255,0.08) 35%, transparent 70%)',
          }}
        />
        <PhoneFrame>
          {/* Nav bar */}
          <div className='flex items-center justify-end px-4 pt-10 pb-1'>
            <CircleIconButton
              size='xs'
              variant='ghost'
              ariaLabel='Notifications'
            >
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
              <p className='mt-0.5 text-[11px] text-[var(--linear-text-tertiary)] tracking-[0.2em] uppercase'>
                Artist
              </p>
            </div>
          </div>

          {/* Profile mode content — "Turn on notifications" + social icons */}
          <div
            className='relative overflow-hidden'
            style={{ height: PHONE_CONTENT_HEIGHT }}
          >
            <div className='absolute inset-0 px-5'>
              {MODE_CONTENT['profile']}
            </div>
          </div>

          {/* Branding */}
          <div className='pb-3 pt-1 text-center'>
            <p className='text-[9px] uppercase tracking-[0.15em] text-[var(--linear-text-quaternary)]'>
              Powered by Jovie
            </p>
          </div>
        </PhoneFrame>
      </div>

      {/* URL caption below the phone */}
      <div
        className='flex items-center rounded-full px-4 py-2'
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.03) 100%)',
          border: '1px solid rgba(255,255,255,0.09)',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.05), 0 10px 24px rgba(0,0,0,0.18)',
        }}
      >
        <span className='text-[12px] text-[var(--linear-text-tertiary)]'>
          jov.ie/
          <span className='font-semibold text-[var(--linear-text-secondary)]'>
            {displayHandle}
          </span>
        </span>
      </div>
    </div>
  );
}
