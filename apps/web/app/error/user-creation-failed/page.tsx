import { Button } from '@jovie/ui';
import { XCircle } from 'lucide-react';
import Link from 'next/link';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { APP_ROUTES } from '@/constants/routes';

export const runtime = 'nodejs';

export default function UserCreationFailedPage() {
  return (
    <div className='fixed inset-0 isolate flex flex-col items-center bg-page text-white overflow-y-auto overflow-x-clip [color-scheme:dark] px-4 sm:px-6 pt-10 pb-10 sm:pt-14 sm:pb-12'>
      {/* Background effects — matches AuthLayout */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 overflow-hidden'
      >
        <div className='absolute left-1/2 top-[8%] h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-accent/12 blur-[120px] sm:top-[10%] sm:h-[34rem] sm:w-[34rem]' />
        <div className='absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.045),transparent_42%)]' />
        <div className='absolute inset-0 bg-[linear-gradient(180deg,rgba(15,16,17,0.72)_0%,rgba(8,9,10,0.96)_68%)]' />
      </div>

      <div className='w-full max-w-[420px] relative z-10 flex flex-col items-center'>
        {/* Logo */}
        <div className='mb-6 sm:mb-8'>
          <Link
            href='/'
            className='block focus-ring-themed rounded-md'
            aria-label='Go to homepage'
          >
            <BrandLogo size={32} tone='auto' />
          </Link>
        </div>

        {/* Title */}
        <h1 className='text-[18px] leading-[22px] font-medium text-white text-center mb-6'>
          Account setup error
        </h1>

        {/* Error content */}
        <div className='w-full space-y-5 text-center'>
          <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[oklch(65%_0.2_25_/_0.3)] bg-[oklch(65%_0.2_25_/_0.1)]'>
            <XCircle
              className='h-5 w-5 text-[oklch(65%_0.2_25)]'
              aria-hidden='true'
            />
          </div>

          <p className='text-[13px] leading-5 text-[lch(90.65%_1.35_282)]'>
            We&apos;re having trouble setting up your account. This is usually
            temporary. Our team has been notified and is working to resolve this
            issue. Please try again in a few minutes.
          </p>

          <div className='flex flex-col gap-2 sm:flex-row'>
            <Button asChild className='flex-1'>
              <Link href={APP_ROUTES.DASHBOARD}>Try again</Link>
            </Button>
            <Button asChild variant='secondary' className='flex-1'>
              <a href='mailto:support@jov.ie?subject=Account%20Setup%20Error'>
                Contact support
              </a>
            </Button>
          </div>

          <p className='text-[11px] uppercase tracking-[0.14em] text-[lch(68%_1.35_282)]'>
            Error code: USER_CREATION_FAILED
          </p>
        </div>
      </div>
    </div>
  );
}
