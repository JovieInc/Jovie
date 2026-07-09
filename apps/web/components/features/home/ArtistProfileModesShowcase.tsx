'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { PHONE_SHOWCASE_MODES } from './phone-showcase-modes';
import { PhoneShowcase } from './phone-showcase-primitives';

export function ArtistProfileModesShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeMode = PHONE_SHOWCASE_MODES[activeIndex];

  return (
    <div className='grid gap-6 lg:grid-cols-[10rem_15.5rem] lg:justify-end lg:gap-8 lg:items-center'>
      <div className='order-2 lg:order-1 lg:w-40'>
        <div className='flex flex-wrap gap-2 lg:flex-col lg:items-start'>
          {PHONE_SHOWCASE_MODES.map((mode, index) => {
            const isActive = index === activeIndex;

            return (
              <button
                key={mode.id}
                type='button'
                aria-pressed={isActive}
                onClick={() => setActiveIndex(index)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-left text-2xs font-semibold tracking-tight transition-colors',
                  isActive
                    ? 'border-white/12 bg-white/[0.045] text-primary-token'
                    : 'border-transparent bg-transparent text-secondary-token hover:border-white/8 hover:bg-white/[0.02] hover:text-primary-token'
                )}
              >
                {mode.outcome}
              </button>
            );
          })}
        </div>

        <p className='mt-3 max-w-36 pl-1 text-2xs leading-5 text-tertiary-token'>
          {activeMode?.summary}
        </p>
      </div>

      <div className='order-1 flex justify-center lg:order-2 lg:justify-end'>
        <div className='w-54 sm:w-56 lg:w-62'>
          <PhoneShowcase
            activeIndex={activeIndex}
            onIndexChange={setActiveIndex}
            modes={PHONE_SHOWCASE_MODES}
            autoRotate={false}
            hideTabs
          />
        </div>
      </div>
    </div>
  );
}
