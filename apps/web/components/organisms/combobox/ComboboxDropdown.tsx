'use client';

import * as Headless from '@headlessui/react';
import { clsx } from 'clsx';
import { forwardRef } from 'react';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { ComboboxOptionItem } from './ComboboxOptionItem';
import type { ComboboxOption } from './types';

interface ComboboxDropdownProps {
  listboxId: string;
  isOpen: boolean;
  isLoading: boolean;
  query: string;
  filteredOptions: ComboboxOption[];
}

export const ComboboxDropdown = forwardRef<
  HTMLDivElement,
  ComboboxDropdownProps
>(({ listboxId, isOpen, isLoading, query, filteredOptions }, ref) => {
  const hasResults = filteredOptions.length > 0;
  const showNoResults = query.length > 0 && !hasResults && !isLoading;

  return (
    <Headless.Combobox.Options
      ref={ref}
      id={listboxId}
      className={clsx(
        'absolute z-50 mt-2 max-h-60 w-full overflow-auto',
        'rounded-xl bg-white/95 backdrop-blur-xl shadow-xl ring-1 ring-white/20',
        'focus-visible:outline-none'
      )}
      static={isOpen}
    >
      {isLoading && query.length > 0 ? (
        // biome-ignore lint/a11y/useSemanticElements: status role needed for accessible loading announcement
        <div className='px-4 py-3 text-sm text-gray-500' role='status'>
          <div className='flex items-center space-x-2'>
            <LoadingSpinner size='sm' className='text-gray-500' />
            <span>Searching artists...</span>
          </div>
        </div>
      ) : showNoResults ? (
        // biome-ignore lint/a11y/useSemanticElements: status role needed for accessible search results announcement
        <div className='px-4 py-4 text-sm text-gray-500' role='status'>
          <p className='mb-2'>No artists found for &quot;{query}&quot;</p>
          <p className='text-xs text-gray-400'>
            Can&apos;t find your artist?{' '}
            <a
              href='https://artists.spotify.com'
              target='_blank'
              rel='noopener noreferrer'
              className='text-indigo-600 hover:text-indigo-500 underline'
            >
              Verify your Spotify artist profile
            </a>
          </p>
        </div>
      ) : (
        filteredOptions.map((option, index) => (
          <ComboboxOptionItem key={option.id} option={option} index={index} />
        ))
      )}
    </Headless.Combobox.Options>
  );
});

ComboboxDropdown.displayName = 'ComboboxDropdown';
