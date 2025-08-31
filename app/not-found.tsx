import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { Footer } from '@/components/site/Footer';
import { Logo } from '@/components/ui/Logo';

export default function NotFound() {
  return (
    <div className='min-h-screen bg-white dark:bg-gray-900'>
      {/* Header */}
      <header className='sticky top-0 z-50 w-full border-b border-gray-200/50 dark:border-white/10 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm supports-backdrop-filter:bg-white/60 dark:supports-backdrop-filter:bg-gray-900/60'>
        <Container>
          <div className='flex h-16 items-center justify-between'>
            <Link href='/' className='flex items-center space-x-2'>
              <Logo size='sm' />
            </Link>
          </div>
        </Container>
      </header>

      {/* Main Content */}
      <main className='flex-1'>
        <Container>
          <div className='flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] text-center px-4'>
            {/* Elegant 404 Display */}
            <div className='mb-8 relative'>
              <div className='absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 opacity-20 blur-xl rounded-full'></div>
              <h1 className='relative text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 tracking-tight'>
                404
              </h1>
            </div>

            {/* Main Message - Apple-style copywriting */}
            <div className='max-w-md mx-auto space-y-4'>
              <h2 className='text-2xl font-medium text-gray-900 dark:text-white tracking-tight'>
                This page is missing.
              </h2>

              <p className='text-base text-gray-600 dark:text-gray-300 leading-relaxed'>
                The link you followed may be broken, or the page may have moved.
              </p>

              {/* Primary Action */}
              <div className='pt-6'>
                <Link
                  href='/'
                  className='inline-flex items-center justify-center rounded-full font-medium transition-all duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 focus-visible:ring-gray-500/50 px-6 py-3 text-base'
                >
                  Return Home
                </Link>
              </div>
            </div>

            {/* Helpful Suggestions - Minimal & Elegant */}
            <div className='mt-16 max-w-lg'>
              <p className='text-sm font-medium text-gray-900 dark:text-white mb-4'>
                You might be looking for:
              </p>
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                <Link
                  href='/artists'
                  className='p-4 rounded-xl border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group'
                >
                  <div className='font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors'>
                    Discover Artists
                  </div>
                  <div className='text-sm text-gray-500 dark:text-gray-400 mt-1'>
                    Find and connect with musicians
                  </div>
                </Link>

                <Link
                  href='/dashboard'
                  className='p-4 rounded-xl border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group'
                >
                  <div className='font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors'>
                    Your Dashboard
                  </div>
                  <div className='text-sm text-gray-500 dark:text-gray-400 mt-1'>
                    Manage your profile and content
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </Container>
      </main>

      <Footer />
    </div>
  );
}
