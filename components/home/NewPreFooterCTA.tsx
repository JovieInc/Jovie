'use client';

import { Button } from '@jovie/ui';
import Link from 'next/link';
import { Container } from '@/components/site/Container';

export function NewPreFooterCTA() {
  return (
    <section className='relative py-20 sm:py-28 bg-white dark:bg-[#0D0E12] transition-colors duration-300'>
      {/* Background with gradient - Light theme */}
      <div className='absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,119,198,0.08),transparent)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,119,198,0.18),transparent)]' />

      {/* Grid pattern - Theme aware */}
      <div className='absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.015)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-size-[56px_56px]' />

      {/* Ambient light effects for glass morphism */}
      <div className='absolute top-1/3 left-1/4 w-80 h-80 bg-linear-to-r from-blue-400/6 to-purple-400/6 dark:from-blue-400/12 dark:to-purple-400/12 rounded-full blur-3xl opacity-40' />
      <div className='absolute bottom-1/3 right-1/4 w-80 h-80 bg-linear-to-r from-purple-400/6 to-cyan-400/6 dark:from-purple-400/12 dark:to-cyan-400/12 rounded-full blur-3xl opacity-40' />

      <Container className='relative'>
        <div className='mx-auto max-w-4xl text-center'>
          {/* Badge with glass morphism effect */}
          <div className='mb-8'>
            <div className='inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-100/80 dark:bg-white/5 border border-neutral-200/60 dark:border-white/10 backdrop-blur-sm text-sm font-medium text-neutral-700 dark:text-white/90 transition-colors duration-200'>
              <svg
                className='w-4 h-4 text-neutral-700 dark:text-white/80'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M13 10V3L4 14h7v7l9-11h-7z'
                />
              </svg>
              Ready to Start
            </div>
          </div>

          {/* Main heading with improved typography hierarchy */}
          <h2 className='text-4xl sm:text-5xl lg:text-6xl font-bold text-neutral-900 dark:text-white tracking-tight leading-[1.1] transition-colors duration-300'>
            Ready to claim
            <br />
            <span className='text-transparent bg-linear-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text font-extrabold'>
              your @handle?
            </span>
          </h2>

          {/* Description with improved readability */}
          <p className='mt-6 text-lg sm:text-xl text-neutral-600 dark:text-neutral-300 font-normal leading-relaxed max-w-2xl mx-auto transition-colors duration-300'>
            Create your profile in 60 seconds. Start converting today.
          </p>

          {/* CTA buttons with enhanced spacing and interactions */}
          <div className='mt-10 flex flex-col sm:flex-row gap-6 justify-center items-center'>
            <Button
              asChild
              size='lg'
              variant='primary'
              className='text-lg px-8 py-4 transition-all duration-200 hover:shadow-lg hover:shadow-neutral-900/15 dark:hover:shadow-white/10'
            >
              <Link
                href='/onboarding'
                className='focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 dark:focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0D0E12] rounded'
              >
                Request Early Access →
              </Link>
            </Button>

            {/* Secondary info with better visual hierarchy */}
            <div className='flex items-center gap-2 text-neutral-600 dark:text-neutral-400 transition-colors duration-300'>
              <svg
                className='w-5 h-5 text-emerald-600 dark:text-emerald-400'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M5 13l4 4L19 7'
                />
              </svg>
              <span className='font-medium'>60-second setup</span>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
