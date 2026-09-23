'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { DSP_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import {
  ActionDial,
  type ActionDialOption,
} from '@/features/release/ActionDial';

const RELEASES = [
  {
    title: 'Never Say A Word',
    art: '/img/releases/never-say-a-word.jpg',
    href: '/tim/never-say-a-word?noredirect=1',
  },
  {
    title: 'The Deep End',
    art: '/img/releases/the-deep-end.jpg',
    href: '/tim/the-deep-end?noredirect=1',
  },
] as const;

const SERVICES = [
  { id: 'spotify', label: 'Spotify' },
  { id: 'apple_music', label: 'Apple Music' },
  { id: 'deezer', label: 'Deezer' },
] as const;

export function SmartLinksDemo() {
  const [releaseIndex, setReleaseIndex] = useState(0);
  const [selectedId, setSelectedId] = useState('spotify');
  const release = RELEASES[releaseIndex]!;
  const options = useMemo<ActionDialOption[]>(
    () =>
      SERVICES.map(service => {
        const logo = DSP_LOGO_CONFIG[service.id];
        return {
          id: service.id,
          label: service.label,
          href: release.href,
          icon: logo?.iconPath ? (
            <svg
              viewBox='0 0 24 24'
              fill='currentColor'
              className='h-5 w-5'
              style={{ color: logo.color }}
              aria-hidden='true'
            >
              <path d={logo.iconPath} />
            </svg>
          ) : undefined,
        };
      }),
    [release.href]
  );

  return (
    <div className='mx-auto w-full max-w-sm rounded-[2rem] border border-white/10 bg-surface-0 p-4 shadow-card-elevated sm:p-6'>
      <div className='mb-5 flex items-center justify-between gap-3'>
        <span className='text-xs font-medium text-tertiary-token'>
          LIVE DEMO
        </span>
        <span className='text-xs text-tertiary-token'>
          jov.ie/tim/{releaseIndex ? 'the-deep-end' : 'never-say-a-word'}
        </span>
      </div>
      <div className='mx-auto aspect-square w-full max-w-62 overflow-hidden rounded-xl bg-surface-2'>
        <Image
          src={release.art}
          alt={`${release.title} cover art`}
          width={500}
          height={500}
          className='h-full w-full object-contain'
          sizes='(max-width: 640px) 248px, 248px'
        />
      </div>
      <div className='mt-4 text-center'>
        <h3 className='text-lg font-semibold text-primary-token'>
          {release.title}
        </h3>
        <p className='text-sm text-tertiary-token'>Tim White</p>
      </div>
      <div className='mt-3'>
        <ActionDial
          options={options}
          selectedId={selectedId}
          onSelect={setSelectedId}
          actionLabel='Open live Smart Link'
          groupLabel='Try the streaming service dial'
          hint='Swipe, tap, or use arrow keys. Your selection follows the next release.'
        />
      </div>
      <div className='mt-2 flex items-center justify-between gap-3 border-t border-white/10 pt-4'>
        <button
          type='button'
          onClick={() => setReleaseIndex(index => (index === 0 ? 1 : 0))}
          className='text-sm font-medium text-primary-token underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
        >
          {releaseIndex === 0
            ? 'See the next release →'
            : 'Back to first release'}
        </button>
        <Link
          className='text-sm text-secondary-token underline underline-offset-4'
          href='/tim'
        >
          Artist profile
        </Link>
      </div>
    </div>
  );
}
