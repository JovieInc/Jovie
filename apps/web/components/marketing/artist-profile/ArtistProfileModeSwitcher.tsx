'use client';

import { useState } from 'react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { HomeProfileShowcase } from '@/features/home/HomeProfileShowcase';
import type { ProfileShowcaseStateId } from '@/features/profile/contracts';
import { cn } from '@/lib/utils';

interface ArtistProfileModeSwitcherProps {
  readonly adaptive: ArtistProfileLandingCopy['adaptive'];
}

const MODE_SHOWCASE_STATE: Record<
  ArtistProfileLandingCopy['adaptive']['modes'][number]['id'],
  ProfileShowcaseStateId
> = {
  release: 'streams-release-day',
  shows: 'tour',
  pay: 'tips-apple-pay',
  subscribe: 'fans-opt-in',
  links: 'catalog',
};

export function ArtistProfileModeSwitcher({
  adaptive,
}: Readonly<ArtistProfileModeSwitcherProps>) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeMode = adaptive.modes[activeIndex] ?? adaptive.modes[0];

  return (
    <div className='mx-auto mt-10 w-full max-w-[400px] text-center sm:mt-12'>
      <HomeProfileShowcase
        stateId={MODE_SHOWCASE_STATE[activeMode.id]}
        presentation='full-phone'
        hideJovieBranding
        hideMoreMenu
        className='mx-auto w-full max-w-[330px]'
      />
      <div className='mx-auto mt-5 flex max-w-[340px] flex-wrap justify-center gap-1.5 rounded-full bg-white/[0.035] p-1.5'>
        {adaptive.modes.map((mode, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              key={mode.id}
              type='button'
              aria-pressed={isActive}
              onClick={() => {
                setActiveIndex(index);
              }}
              className={cn(
                'rounded-full px-3.5 py-2 text-[12px] font-medium transition-colors',
                isActive
                  ? 'bg-white text-black'
                  : 'text-tertiary-token hover:bg-white/[0.06] hover:text-primary-token'
              )}
            >
              {mode.label}
            </button>
          );
        })}
      </div>
      <p className='mx-auto mt-5 max-w-[23rem] text-[15px] font-medium leading-[1.45] tracking-[-0.02em] text-secondary-token'>
        {activeMode.headline}
      </p>
    </div>
  );
}
