import { Button } from '@jovie/ui';
import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { HeroExampleProfiles } from './HeroExampleProfiles';
import { HeroHandlePreviewChip } from './HeroHandlePreviewChip';
import { QRCodeCard } from './QRCodeCard';

export function NewHomeHero() {
  return (
    <section className='relative overflow-hidden pt-6 pb-10 sm:pt-10 sm:pb-14 lg:pt-14 lg:pb-20'>
      {/* Subtle background gradient */}
      <div className='absolute inset-0 bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-black'></div>

      {/* Subtle grid background pattern */}
      <div className='absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]'></div>

      {/* Ambient light effects */}
      <div className='absolute top-0 left-1/4 w-96 h-96 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-full blur-3xl'></div>
      <div className='absolute bottom-0 right-1/4 w-96 h-96 bg-gradient-to-r from-purple-500/10 to-cyan-500/10 rounded-full blur-3xl'></div>

      <Container className='relative'>
        <div className='flex flex-col lg:flex-row lg:items-center lg:gap-12'>
          {/* Left column: Text and form */}
          <div className='flex-1 text-center lg:text-left'>
            <h1 className='text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl lg:text-6xl'>
              Claim your{' '}
              <span className='text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 dark:from-blue-400 dark:via-purple-400 dark:to-cyan-400'>
                @handle
              </span>
              .
            </h1>

            <p className='mt-3 text-base leading-7 text-gray-700 dark:text-gray-200 sm:text-lg sm:leading-8 max-w-2xl mx-auto lg:mx-0'>
              Secure your name. Share a profile that&apos;s fast, beautiful, and
              optimized to convert.
            </p>

            {/* Waitlist CTA */}
            <div className='mt-6 max-w-md mx-auto lg:mx-0'>
              <Button asChild size='lg' data-test='waitlist-btn'>
                <Link href='/waitlist'>Join the waitlist</Link>
              </Button>
              <HeroExampleProfiles />
            </div>
          </div>

          {/* Right column: Device mockup (desktop only) */}
          <div className='hidden lg:block flex-1 mt-12 lg:mt-0 relative'>
            <div className='relative mx-auto w-full max-w-sm'>
              {/* Phone mockup with shadow */}
              <div className='relative mx-auto rounded-[2.5rem] border-4 border-gray-200 dark:border-gray-800 shadow-xl dark:shadow-gray-900/30 bg-white dark:bg-gray-900 p-1 overflow-hidden'>
                <div className='absolute top-0 inset-x-0 h-6 bg-gray-200 dark:bg-gray-800 rounded-t-2xl'></div>
                <div className='h-[580px] rounded-2xl overflow-hidden'>
                  {/* Profile preview */}
                  <div className='relative h-full w-full bg-gray-50 dark:bg-black'>
                    <div className='absolute top-8 inset-x-0 text-center'>
                      <div className='inline-flex items-center px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-sm font-medium text-gray-800 dark:text-gray-200'>
                        <span className='mr-1 text-gray-400'>@</span>
                        <HeroHandlePreviewChip />
                      </div>
                    </div>

                    {/* Profile avatar placeholder */}
                    <div className='absolute top-20 inset-x-0 flex justify-center'>
                      <div className='w-24 h-24 rounded-full bg-gradient-to-r from-blue-500 to-purple-500'></div>
                    </div>

                    {/* Profile content placeholders */}
                    <div className='absolute top-52 inset-x-0 px-6 space-y-4'>
                      <div className='h-8 bg-gray-200 dark:bg-gray-800 rounded-lg w-3/4 mx-auto'></div>
                      <div className='h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/2 mx-auto'></div>

                      <div className='pt-4 space-y-3'>
                        <div className='h-12 bg-gray-200 dark:bg-gray-800 rounded-lg'></div>
                        <div className='h-12 bg-gray-200 dark:bg-gray-800 rounded-lg'></div>
                        <div className='h-12 bg-gray-200 dark:bg-gray-800 rounded-lg'></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* QR code card */}
              <div className='absolute -right-12 bottom-12'>
                <QRCodeCard handle='yourhandle' />
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
