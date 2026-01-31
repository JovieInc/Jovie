'use client';

import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';

interface HandleStatusIconProps {
  readonly showChecking: boolean;
  readonly handle: string;
  readonly available: boolean | null;
  readonly handleError: string | null;
  readonly unavailable: boolean;
}

export function HandleStatusIcon({
  showChecking,
  handle,
  available,
  handleError,
  unavailable,
}: HandleStatusIconProps) {
  if (showChecking) {
    return (
      <LoadingSpinner size='sm' className='text-zinc-500 dark:text-zinc-400' />
    );
  }
  if (!handle) return null;
  if (available === true && !handleError) {
    return (
      <svg
        className='h-4 w-4 text-green-600'
        viewBox='0 0 20 20'
        fill='currentColor'
        aria-hidden='true'
      >
        <path
          fillRule='evenodd'
          d='M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 10-1.214-.882l-3.2 4.4-1.63-1.63a.75.75 0 10-1.06 1.06l2.25 2.25a.75.75 0 001.145-.089l3.71-5.109z'
          clipRule='evenodd'
        />
      </svg>
    );
  }
  if (unavailable) {
    return (
      <svg
        className='h-4 w-4 text-red-600'
        viewBox='0 0 20 20'
        fill='currentColor'
        aria-hidden='true'
      >
        <path
          fillRule='evenodd'
          d='M10 18a8 8 0 100-16 8 8 0 000 16zM7.75 7.75a.75.75 0 011.06 0L10 8.94l1.19-1.19a.75.75 0 111.06 1.06L11.06 10l1.19 1.19a.75.75 0 11-1.06 1.06L10 11.06l-1.19 1.19a.75.75 0 11-1.06-1.06L8.94 10 7.75 8.81a.75.75 0 010-1.06z'
          clipRule='evenodd'
        />
      </svg>
    );
  }
  return null;
}
