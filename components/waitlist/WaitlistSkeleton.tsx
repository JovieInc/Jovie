import Link from 'next/link';
import { LogoIcon } from '@/components/atoms/LogoIcon';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

export function WaitlistSkeleton() {
  return (
    <div className='min-h-screen flex flex-col items-center justify-center bg-[#101012] px-4'>
      {/* Logo */}
      <div className='mb-6'>
        <LogoIcon size={56} variant='white' />
      </div>

      {/* Title */}
      <div className='space-y-2 mb-8 text-center'>
        <div className='h-5 w-48 mx-auto rounded-md skeleton motion-reduce:animate-none' />
        <div className='h-4 w-64 mx-auto rounded-md skeleton motion-reduce:animate-none' />
      </div>

      {/* Form skeleton */}
      <div className='w-full max-w-sm space-y-4'>
        <LoadingSkeleton height='h-12' />
        <LoadingSkeleton height='h-12' />
        <LoadingSkeleton height='h-12' />
        <LoadingSkeleton height='h-12' />
        <LoadingSkeleton height='h-12' />
        <LoadingSkeleton height='h-12' />
      </div>

      {/* Footer */}
      <div className='mt-8 h-4 w-40 rounded-md skeleton motion-reduce:animate-none' />

      {/* Legal links */}
      <div className='absolute bottom-4 flex gap-4 text-xs text-[#666]'>
        <Link
          href='/legal/terms'
          className='hover:text-white transition-colors no-underline'
        >
          Terms
        </Link>
        <Link
          href='/legal/privacy'
          className='hover:text-white transition-colors no-underline'
        >
          Privacy Policy
        </Link>
      </div>
    </div>
  );
}
