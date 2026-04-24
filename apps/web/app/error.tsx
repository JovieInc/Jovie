'use client';

import type { ErrorProps } from '@/types/common';

const ICON_PATH =
  'm176.84,0l3.08.05c8.92,1.73,16.9,6.45,23.05,13.18,7.95,8.7,12.87,20.77,12.87,34.14s-4.92,25.44-12.87,34.14c-6.7,7.34-15.59,12.28-25.49,13.57h-.64s0,.01,0,.01h0c-22.2,0-42.3,8.84-56.83,23.13-14.5,14.27-23.49,33.99-23.49,55.77h0v.02c0,21.78,8.98,41.5,23.49,55.77,14.54,14.3,34.64,23.15,56.83,23.15v-.02h.01c22.2,0,42.3-8.84,56.83-23.13,14.51-14.27,23.49-33.99,23.49-55.77h0c0-17.55-5.81-33.75-15.63-46.82-10.08-13.43-24.42-23.61-41.05-28.62l-2.11-.64c4.36-2.65,8.34-5.96,11.84-9.78,9.57-10.47,15.5-24.89,15.5-40.77s-5.93-30.3-15.5-40.77c-1.44-1.57-2.95-3.06-4.55-4.44l7.67,1.58c40.44,8.35,75.81,30.3,100.91,60.75,24.66,29.91,39.44,68.02,39.44,109.5h0c0,48.05-19.81,91.55-51.83,123.05-31.99,31.46-76.19,50.92-125,50.92v.02h-.01c-48.79,0-93-19.47-125-50.94C19.81,265.54,0,222.04,0,173.99h0c0-48.05,19.81-91.56,51.83-123.05C83.84,19.47,128.04,0,176.84,0Z';

export default function RootError({ error, reset }: ErrorProps) {
  return (
    <div className='flex min-h-dvh items-center justify-center bg-[#08090a] px-6 text-white'>
      <div className='flex w-full max-w-[320px] flex-col items-center text-center'>
        <svg
          viewBox='0 0 353.68 347.97'
          fill='none'
          xmlns='http://www.w3.org/2000/svg'
          aria-hidden='true'
          className='h-8 w-8'
        >
          <path fill='currentColor' d={ICON_PATH} />
        </svg>

        <h1 className='mt-5 text-[18px] font-semibold leading-[1.3] tracking-[-0.02em]'>
          Something Went Wrong
        </h1>
        <p className='mt-2 text-sm leading-normal text-[#969799]'>
          An unexpected error occurred.
        </p>

        <div className='mt-6 flex flex-row items-center gap-3'>
          <button
            type='button'
            onClick={reset}
            className='h-9 cursor-pointer rounded-full bg-[#e6e6e6] px-4 text-sm font-medium text-[#08090a] transition-[background] duration-150 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7170ff] active:scale-[0.97]'
          >
            Try Again
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Using <a> for resilience when Next.js routing may be broken */}
          <a
            href='/'
            className='flex h-9 items-center rounded-full border border-white/[0.08] bg-transparent px-4 text-sm font-medium text-[#969799] transition-[background,border-color] duration-150 hover:border-white/[0.12] hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7170ff] active:scale-[0.97]'
          >
            Go Home
          </a>
        </div>

        {error.digest ? (
          <p className='mt-5 text-xs text-[#62666d]'>
            Error ID: {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  );
}
