import { Button } from '@jovie/ui';
import Link from 'next/link';

export function LinkInBioCTA() {
  return (
    <section className='relative py-24 sm:py-32 bg-white dark:bg-gray-900 transition-colors duration-300'>
      {/* Background with gradient */}
      <div className='absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-cyan-500/5 dark:from-blue-500/10 dark:via-purple-500/10 dark:to-cyan-500/10' />

      {/* Grid pattern - Theme aware */}
      <div className='absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:30px_30px]' />

      <div className='relative mx-auto max-w-4xl px-6 lg:px-8 text-center'>
        {/* Badge */}
        <div className='mb-8'>
          <div className='inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 text-sm font-medium text-green-400'>
            <svg
              className='w-4 h-4'
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
            Ready to convert fans
          </div>
        </div>

        {/* Main headline */}
        <h2 className='text-4xl font-semibold tracking-tight text-primary-token sm:text-5xl lg:text-6xl mb-8'>
          <span className='block'>
            Ready to turn{' '}
            <span className='text-transparent bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 dark:from-blue-400 dark:via-purple-400 dark:to-cyan-400 bg-clip-text'>
              clicks
            </span>
          </span>
          <span className='block'>into streams?</span>
        </h2>

        {/* Description */}
        <p className='mt-8 text-xl text-secondary-token font-light leading-relaxed max-w-2xl mx-auto'>
          Create your professional music profile in 60 seconds.
          <br />
          <span className='text-tertiary-token'>
            Start converting fans today.
          </span>
        </p>

        {/* CTA buttons */}
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
        </div>

        {/* Trust indicators */}
        <div className='mt-12 flex items-center justify-center gap-2 text-tertiary-token'>
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
          <span className='text-sm'>
            Free forever • No credit card required • Live in 60 seconds
          </span>
        </div>

        {/* Social proof */}
        <div className='mt-8'>
          <p className='text-xs text-quaternary-token font-medium'>
            Join 10,000+ artists already converting fans with Jovie
          </p>
        </div>
      </div>
    </section>
  );
}
