'use client';

import * as Headless from '@headlessui/react';
import { clsx } from 'clsx';
import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { ComboboxOption } from './types';

interface ComboboxOptionItemProps {
  readonly option: ComboboxOption;
  readonly index: number;
}

function getOptionInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Option image with loading shimmer and error fallback */
function OptionImage({
  imageUrl,
  name,
}: {
  readonly imageUrl?: string;
  readonly name: string;
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  if (!imageUrl || hasError) {
    return (
      <div
        className='h-8 w-8 rounded-full bg-surface-2 flex-shrink-0 flex items-center justify-center'
        aria-hidden='true'
      >
        <span className='text-[10px] font-medium text-secondary-token select-none leading-none'>
          {getOptionInitials(name)}
        </span>
      </div>
    );
  }

  return (
    <div className='h-8 w-8 rounded-full overflow-hidden flex-shrink-0 relative bg-surface-3'>
      <Image
        src={imageUrl}
        alt=''
        width={32}
        height={32}
        sizes='32px'
        className={cn(
          'h-8 w-8 rounded-full object-cover transition-opacity duration-200',
          isLoaded ? 'opacity-100' : 'opacity-0'
        )}
        loading='lazy'
        aria-hidden='true'
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
      />
      {!isLoaded && (
        <div
          className='absolute inset-0 rounded-full skeleton'
          aria-hidden='true'
        />
      )}
    </div>
  );
}

export function ComboboxOptionItem({ option, index }: ComboboxOptionItemProps) {
  return (
    <Headless.Combobox.Option
      className={({ active }) =>
        clsx(
          'relative cursor-pointer select-none px-4 py-3 transition-colors',
          'focus-visible:outline-none',
          active
            ? 'bg-indigo-600 text-white'
            : 'text-gray-900 hover:bg-gray-50'
        )
      }
      value={option}
      data-index={index}
      id={`option-${option.id}`}
    >
      {({ active, selected }) => (
        <div className='flex items-center space-x-3'>
          <OptionImage imageUrl={option.imageUrl} name={option.name} />
          <span
            className={clsx(
              'truncate text-sm',
              active || selected ? 'font-semibold' : 'font-normal'
            )}
          >
            {option.name}
          </span>
          {(active || selected) && (
            <span
              className={clsx(
                'absolute inset-y-0 right-0 flex items-center pr-4',
                active ? 'text-white' : 'text-indigo-600'
              )}
              aria-hidden='true'
            >
              <svg
                className='h-4 w-4'
                fill='currentColor'
                viewBox='0 0 20 20'
                aria-hidden='true'
              >
                <path
                  fillRule='evenodd'
                  d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z'
                  clipRule='evenodd'
                />
              </svg>
            </span>
          )}
        </div>
      )}
    </Headless.Combobox.Option>
  );
}
