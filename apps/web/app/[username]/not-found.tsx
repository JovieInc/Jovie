import Link from 'next/link';
import { Container } from '@/components/site/Container';

export default function NotFound() {
  return (
    <div className='min-h-screen bg-white dark:bg-[#0D0E12] transition-colors grid-bg dark:grid-bg-dark'>
      <Container className='flex min-h-screen items-center justify-center'>
        <div className='w-full max-w-xl mx-auto text-center px-4 py-24 animate-fade-in-up'>
          <div className='mb-10 relative'>
            <div className='absolute -inset-1 rounded-full bg-linear-to-r from-gray-900/5 via-gray-500/10 to-gray-900/5 dark:from-white/10 dark:via-white/5 dark:to-white/10 blur-2xl' />
            <div className='relative flex flex-col items-center gap-1'>
              <span className='text-6xl md:text-8xl font-semibold tracking-tight text-gray-900 dark:text-white'>
                404
              </span>
              <span className='text-xs font-medium tracking-[0.3em] uppercase text-gray-500 dark:text-gray-400'>
                Not found
              </span>
            </div>
          </div>

          <h1 className='text-2xl md:text-3xl font-medium text-gray-900 dark:text-white tracking-tight mb-3'>
            Profile not found
          </h1>
          <p className='text-base text-gray-600 dark:text-gray-300 leading-relaxed mb-8'>
            The profile you&apos;re looking for doesn&apos;t exist or isn&apos;t
            public.
          </p>

          <div className='flex items-center justify-center gap-3'>
            <Link
              href='/'
              className='inline-flex items-center justify-center rounded-full font-medium transition-all duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 focus-visible:ring-gray-500/50 px-6 py-3 text-base'
            >
              Go home
            </Link>
            <Link
              href='/app/dashboard'
              className='inline-flex items-center justify-center rounded-full font-medium transition-all duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 focus-visible:ring-gray-500/50 px-6 py-3 text-base'
            >
              Go to dashboard
            </Link>
          </div>
        </div>
      </Container>
    </div>
  );
}
