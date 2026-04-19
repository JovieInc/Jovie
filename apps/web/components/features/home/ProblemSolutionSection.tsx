'use client';

import { Button } from '@jovie/ui/atoms/button';
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
        <div className='inline-flex items-center rounded-full bg-surface-1/80 px-4 py-2 text-sm font-medium text-secondary-token backdrop-blur-sm border border-subtle'>
          <div className='flex h-2 w-2 items-center justify-center mr-2'>
            <div className='h-1.5 w-1.5 rounded-full bg-amber-400 dark:bg-amber-500 animate-pulse motion-reduce:animate-none' />
          </div>
          The Problem & Our Solution
        </div>

        {/* Unified heading */}
        <h2
          id='problem-solution-heading'
          className='mt-6 text-4xl md:text-6xl font-medium tracking-tight text-balance text-primary-token'
        >
          Your bio link is a speed bump.
          <br />
          <span className='text-3xl md:text-5xl text-secondary-token font-semibold'>
            We built the off-ramp.
          </span>
        </h2>

        <h3 className='mt-6 text-2xl md:text-3xl font-bold text-primary-token'>
          Stop designing. Start converting.
        </h3>

        {/* Unified narrative flow */}
        <div className='mt-6 space-y-4 max-w-4xl mx-auto'>
          <p className='text-lg text-secondary-token leading-relaxed'>
            Every extra tap taxes attention. &ldquo;Cute&rdquo; layouts bleed
            streams, follows, and ticket sales.
          </p>
          <p className='text-lg text-secondary-token leading-relaxed font-medium'>
            Jovie ships a locked, elite artist page in seconds—built for streams
            and sales, not vibes. One link. One funnel. More plays, more pay.
          </p>
        </div>

        {/* Linear-inspired CTA button */}
        <div className='mt-8'>
          <Button
            asChild
            variant='primary'
            size='hero'
            className='group shadow-sm hover:shadow-md'
          >
            <Link href='/onboarding' onClick={handleClick}>
              <span>Request Early Access</span>
              <svg
                className='ml-2 h-4 w-4 transition-transform duration-slow group-hover:translate-x-1'
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
          </Button>
          <p className='mt-3 text-sm text-tertiary-token'>
            Go live in 60 seconds
          </p>
        </div>
      </div>
    </section>
  );
}
