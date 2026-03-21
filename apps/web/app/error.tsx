'use client';

import type { ErrorProps } from '@/types/common';

export default function RootError({ error, reset }: ErrorProps) {
  return (
    <main className='min-h-screen bg-base text-primary-token'>
      <div className='mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 py-16 text-center'>
        <p className='mb-4 text-[12px] uppercase tracking-[0.22em] text-tertiary-token'>
          Error
        </p>
        <h1 className='text-[28px] font-[520] tracking-[-0.03em]'>
          Something went wrong
        </h1>
        <p className='mt-3 max-w-sm text-[14px] leading-relaxed text-secondary-token'>
          {error.message || 'Please try again.'}
        </p>
        <button
          type='button'
          onClick={() => reset()}
          className='mt-8 inline-flex min-h-10 items-center justify-center rounded-(--linear-radius-sm) border border-subtle px-4 text-[13px] font-medium text-primary-token'
        >
          Try again
        </button>
      </div>
    </main>
  );
}
