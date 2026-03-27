'use client';

import Link from 'next/link';
import type { ErrorProps } from '@/types/common';

export default function RootError({ error, reset }: ErrorProps) {
  return (
    <div className='dark linear-marketing flex min-h-screen items-center justify-center bg-base px-6 text-primary-token'>
      <div className='w-full max-w-md space-y-4 text-center'>
        <h1 className='text-2xl font-semibold tracking-tight'>
          Something went wrong
        </h1>
        <p className='text-sm leading-6 text-secondary-token'>
          We hit an unexpected error while loading this page.
        </p>
        <div className='flex flex-col justify-center gap-3 sm:flex-row'>
          <button
            type='button'
            onClick={reset}
            className='btn-linear-signup focus-ring-themed'
          >
            Try again
          </button>
          <Link href='/' className='btn-linear-login focus-ring-themed'>
            Go home
          </Link>
        </div>
        {error.digest ? (
          <p className='text-xs text-quaternary-token'>{error.digest}</p>
        ) : null}
      </div>
    </div>
  );
}
