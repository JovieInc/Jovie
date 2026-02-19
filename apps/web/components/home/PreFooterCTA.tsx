import { Button } from '@jovie/ui';
import Link from 'next/link';

export function PreFooterCTA() {
  return (
    <section className='relative py-24 sm:py-32 bg-base transition-colors duration-300'>
      {/* Background with gradient - Light theme */}
      <div className='absolute inset-0 bg-linear-to-br from-blue-500/5 via-purple-500/5 to-cyan-500/5 dark:from-blue-500/10 dark:via-purple-500/10 dark:to-cyan-500/10' />

      {/* Grid pattern - Theme aware */}
      <div className='absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-size-[50px_50px]' />

      {/* Ambient light effects for glass morphism */}
      <div className='absolute top-1/4 left-1/4 w-96 h-96 bg-linear-to-r from-blue-400/10 to-purple-400/10 dark:from-blue-400/20 dark:to-purple-400/20 rounded-full blur-3xl opacity-50' />
      <div className='absolute bottom-1/4 right-1/4 w-96 h-96 bg-linear-to-r from-purple-400/10 to-cyan-400/10 dark:from-purple-400/20 dark:to-cyan-400/20 rounded-full blur-3xl opacity-50' />

      <div className='relative mx-auto max-w-5xl px-6 lg:px-8'>
        <div className='mx-auto max-w-4xl text-center'>
          {/* Badge with glass morphism effect */}
          <div className='mb-8'>
            <div className='inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-1/80 border border-subtle backdrop-blur-sm text-sm font-medium text-secondary-token transition-all duration-300 hover:bg-surface-2/80 hover:scale-105'>
              <svg
                className='w-4 h-4 text-blue-600 dark:text-blue-400'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
                aria-hidden='true'
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
          <h2 className='text-4xl sm:text-5xl lg:text-6xl font-medium text-primary-token tracking-tight leading-[1.1] transition-colors duration-300'>
            Ready to turn fans
            <br />
            <span className='text-transparent bg-linear-to-r from-blue-600 via-purple-600 to-cyan-600 dark:from-blue-400 dark:via-purple-400 dark:to-cyan-400 bg-clip-text font-extrabold'>
              into streams?
            </span>
          </h2>

          {/* Description with improved readability */}
          <p className='mt-8 text-xl text-secondary-token font-light leading-relaxed max-w-2xl mx-auto transition-colors duration-300'>
            Create your professional music profile in 60 seconds.
            <br />
            <span className='text-tertiary-token'>
              Start converting fans today.
            </span>
          </p>

          {/* CTA buttons with enhanced spacing and interactions */}
          <div className='mt-12 flex flex-col sm:flex-row gap-6 justify-center items-center'>
            <Button
              asChild
              size='lg'
              variant='primary'
              className='text-lg px-8 py-4 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-indigo-500/25 dark:hover:shadow-indigo-400/25'
            >
              <Link href='/onboarding'>Create Your Profile</Link>
            </Button>

            <Button
              asChild
              size='lg'
              variant='secondary'
              className='text-lg px-8 py-4 transition-all duration-300 hover:scale-105'
            >
              <Link href='/pricing'>View Pricing</Link>
            </Button>

            {/* Secondary info with better visual hierarchy */}
            <div className='flex items-center gap-2 text-tertiary-token transition-colors duration-300'>
              <svg
                className='w-5 h-5 text-success'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
                aria-hidden='true'
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

          {/* Social proof with enhanced styling */}
          <div className='mt-10 p-4 rounded-2xl bg-surface-1/50 backdrop-blur-sm border border-subtle transition-all duration-300'>
            <p className='text-sm text-tertiary-token font-medium'>
              Join{' '}
              <span className='text-blue-600 dark:text-blue-400 font-semibold'>
                10,000+
              </span>{' '}
              artists already using Jovie
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
