'use client';

import { ComboboxOptions } from '@headlessui/react';
import { Spinner as LoadingSpinner } from '@jovie/ui';
import {
  OVERLAY_CONTENT_RADIUS,
  OVERLAY_SURFACE_BASE,
} from '@jovie/ui/lib/dropdown-styles';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { ComboboxOptionItem } from './ComboboxOptionItem';
import type { ComboboxOption } from './types';

interface ComboboxDropdownProps {
  readonly listboxId: string;
  readonly isOpen: boolean;
  readonly isLoading: boolean;
  readonly query: string;
  readonly filteredOptions: ComboboxOption[];
}

export const ComboboxDropdown = forwardRef<
  HTMLDivElement,
  ComboboxDropdownProps
>(({ listboxId, isOpen, isLoading, query, filteredOptions }, ref) => {
  const hasResults = filteredOptions.length > 0;
  const showNoResults = query.length > 0 && !hasResults && !isLoading;

  return (
    <ComboboxOptions
      ref={ref}
      id={listboxId}
      className={cn(
        'absolute z-50 mt-2 max-h-60 w-full overflow-y-auto overflow-x-hidden p-1 focus-visible:outline-none',
        OVERLAY_CONTENT_RADIUS,
        OVERLAY_SURFACE_BASE
      )}
      static={isOpen}
    >
      {(() => {
        if (isLoading && query.length > 0) {
          return (
            <output
              className='px-4 py-3 text-sm text-secondary-token'
              aria-live='polite'
            >
              <div className='flex items-center space-x-2'>
                <LoadingSpinner size='sm' className='text-tertiary-token' />
                <span>Searching artists...</span>
              </div>
            </output>
          );
        }
        if (showNoResults) {
          return (
            <output
              className='px-4 py-4 text-sm text-secondary-token'
              aria-live='polite'
            >
              <p className='mb-2'>No artists found for &quot;{query}&quot;</p>
              <p className='text-xs text-tertiary-token'>
                Can&apos;t find your artist?{' '}
                <a
                  href='https://artists.spotify.com'
                  target='_blank'
                  rel='noopener noreferrer'
                  className='text-accent hover:text-accent-hover underline'
                >
                  Verify your Spotify artist profile
                </a>
              </p>
            </output>
          );
        }
        return filteredOptions.map((option, index) => (
          <ComboboxOptionItem key={option.id} option={option} index={index} />
        ));
      })()}
    </ComboboxOptions>
  );
});

ComboboxDropdown.displayName = 'ComboboxDropdown';
