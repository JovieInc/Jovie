import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Container } from '@/components/site/Container';

export function NewHomeHero() {
  return (
    <section className='relative overflow-hidden min-h-svh flex items-center py-16 sm:py-20 lg:py-24'>
      {/* Subtle gradient background + vignette */}
      <div className='absolute inset-0 -z-10'>
        <div className='absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,119,198,0.15),transparent)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,119,198,0.25),transparent)]' />
        <div className='absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.03)_100%)] dark:bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.4)_100%)]' />
      </div>

      <Container className='relative'>
        <div className='max-w-4xl mx-auto text-center md:text-left'>
          {/* Headline */}
          <h1 className='text-4xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-6xl lg:text-7xl leading-[1.05]'>
            <span className='md:whitespace-nowrap'>You make music.</span>
            <br />
            <span className='md:whitespace-nowrap'>
              Jovie handles{' '}
              <span className='bg-linear-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent'>
                growth.
              </span>
            </span>
          </h1>

          {/* Subheadline */}
          <p className='mt-5 text-lg leading-relaxed text-neutral-600 dark:text-neutral-400 sm:text-xl max-w-2xl mx-auto md:mx-0'>
            Jovie is your AI music manager,
            <br />
            turning attention into fans—automatically.
          </p>

          {/* CTA */}
          <div className='mt-8 flex flex-col items-center gap-3 md:items-start'>
            <Link
              href='/waitlist'
              className='group inline-flex items-center justify-center gap-2 h-14 px-10 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-black text-base font-medium transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-neutral-900/25 dark:hover:shadow-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 dark:focus-visible:ring-white focus-visible:ring-offset-2'
            >
              Request Early Access
              <ArrowRight className='h-4 w-4 transition-transform group-hover:translate-x-0.5' />
            </Link>
            <Link
              href='#features'
              className='text-xs text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors'
            >
              See how it works ↓
            </Link>
          </div>

          {/* Badge - moved below */}
          <div className='mt-8 inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium rounded-full bg-neutral-100 dark:bg-white/10 text-neutral-500 dark:text-neutral-400 border border-neutral-200/50 dark:border-white/10'>
            <span className='relative flex h-1.5 w-1.5'>
              <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75' />
              <span className='relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500' />
            </span>
            AI Powered Creator Profiles
          </div>
        </div>
      </Container>
    </section>
  );
}
