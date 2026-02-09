'use client';

import Link from 'next/link';
import { track } from '@/lib/analytics';

export function ProblemSolutionSection() {
  const handleClick = () => {
    track('claim_handle_click', { section: 'problem-solution' });
  };

  return (
    <section
      id='problem'
      aria-labelledby='problem-solution-heading'
      className='relative border-t border-subtle'
    >
      <div className='mx-auto max-w-5xl px-4 py-14 md:py-18 text-center'>
        {/* Unified badge with Linear-inspired styling */}
        <div className='inline-flex items-center rounded-full bg-gray-100/80 dark:bg-white/5 px-4 py-2 text-sm font-medium text-gray-700 dark:text-white/80 backdrop-blur-sm border border-subtle'>
          <div className='flex h-2 w-2 items-center justify-center mr-2'>
            <div className='h-1.5 w-1.5 rounded-full bg-amber-400 dark:bg-amber-500 animate-pulse motion-reduce:animate-none' />
          </div>
          The Problem & Our Solution
        </div>

        {/* Unified heading */}
        <h2
          id='problem-solution-heading'
          className='mt-6 text-4xl md:text-6xl font-medium tracking-tight text-balance text-gray-900 dark:text-white'
        >
          Your bio link is a speed bump.
          <br />
          <span className='text-3xl md:text-5xl text-gray-600 dark:text-white/70 font-semibold'>
            We built the off-ramp.
          </span>
        </h2>

        <h3 className='mt-6 text-2xl md:text-3xl font-bold text-gray-900 dark:text-white'>
          Stop designing. Start converting.
        </h3>

        {/* Unified narrative flow */}
        <div className='mt-6 space-y-4 max-w-4xl mx-auto'>
          <p className='text-lg text-gray-600 dark:text-white/70 leading-relaxed'>
            Every extra tap taxes attention. &ldquo;Cute&rdquo; layouts bleed
            streams, follows, and ticket sales.
          </p>
          <p className='text-lg text-gray-700 dark:text-white/80 leading-relaxed font-medium'>
            Jovie ships a locked, elite artist page in seconds—built for streams
            and sales, not vibes. One link. One funnel. More plays, more pay.
          </p>
        </div>

        {/* Linear-inspired CTA button */}
        <div className='mt-8'>
          <Link
            href='/onboarding'
            onClick={handleClick}
            className='inline-flex items-center justify-center px-8 py-4 text-base font-semibold text-white bg-gray-900 hover:bg-gray-800 dark:bg-gray-50 dark:text-gray-900 dark:hover:bg-gray-200 rounded-lg border border-gray-900 dark:border-gray-50 transition-all duration-200 ease-in-out focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gray-400 dark:focus-visible:ring-gray-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 shadow-sm hover:shadow-md disabled:opacity-50 disabled:pointer-events-none group'
          >
            <span>Request Early Access</span>
            <svg
              className='ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'
              strokeWidth={2}
              aria-hidden='true'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M13 7l5 5m0 0l-5 5m5-5H6'
              />
            </svg>
          </Link>
          <p className='mt-3 text-sm text-gray-500 dark:text-white/50'>
            Go live in 60 seconds
          </p>
        </div>
      </div>
    </section>
  );
}
