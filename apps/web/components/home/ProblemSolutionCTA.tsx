'use client';

import Link from 'next/link';
import { track } from '@/lib/analytics';

export function ProblemSolutionCTA() {
  const handleClick = () => {
    track('claim_handle_click', { section: 'problem-solution' });
  };

  return (
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
  );
}
