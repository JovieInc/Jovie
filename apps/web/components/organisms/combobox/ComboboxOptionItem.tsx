'use client';

import * as Headless from '@headlessui/react';
import { clsx } from 'clsx';
import Image from 'next/image';
import type { ComboboxOption } from './types';

interface ComboboxOptionItemProps {
  option: ComboboxOption;
  index: number;
}

export function ComboboxOptionItem({ option, index }: ComboboxOptionItemProps) {
  return (
    <Headless.Combobox.Option
      className={({ active }) =>
        clsx(
          'relative cursor-pointer select-none px-4 py-3 transition-colors',
          'focus-visible:outline-none',
          active ? 'bg-indigo-600 text-white' : 'text-gray-900 hover:bg-gray-50'
        )
      }
      value={option}
      data-index={index}
      id={`option-${option.id}`}
    >
      {({ active, selected }) => (
        <div className='flex items-center space-x-3'>
          {option.imageUrl ? (
            <Image
              src={option.imageUrl}
              alt=''
              width={32}
              height={32}
              className='h-8 w-8 rounded-full object-cover flex-shrink-0'
              loading='lazy'
              aria-hidden='true'
            />
          ) : (
            <div
              className='h-8 w-8 rounded-full bg-gray-200 flex-shrink-0'
              aria-hidden='true'
            />
          )}
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
