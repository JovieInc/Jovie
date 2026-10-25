'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { DialDemo } from '@/features/release/DialDemo';

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

export function SmartLinksDemo() {
  const [releaseIndex, setReleaseIndex] = useState(0);
  const release = RELEASES[releaseIndex]!;
  return (
    <div
      className='mx-auto w-full max-w-sm rounded-4xl border border-white/10 bg-surface-0 p-4 shadow-card-elevated sm:p-6'
      data-testid='smart-links-demo'
    >
      <div className='mb-5 flex items-center justify-between gap-3'>
        <span className='text-xs font-medium text-tertiary-token'>
          LIVE DEMO
        </span>
        <span className='text-xs text-tertiary-token'>
          jov.ie/tim/{releaseIndex ? 'the-deep-end' : 'never-say-a-word'}
        </span>
      </div>
      <div className='relative mx-auto aspect-square w-full max-w-62 overflow-hidden rounded-xl bg-surface-2'>
        <Image
          src={release.art}
          alt={`${release.title} cover art`}
          fill
          className='object-contain'
          sizes='248px'
        />
      </div>
      <div className='mt-4 text-center'>
        <h3 className='text-lg font-semibold text-primary-token'>
          {release.title}
        </h3>
        <p className='text-sm text-tertiary-token'>Tim White</p>
      </div>
      <div className='mt-3'>
        <DialDemo hint='Swipe, flick, or use arrow keys to try it.' />
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
          prefetch={false}
        >
          Artist profile
        </Link>
      </div>
    </div>
  );
}
