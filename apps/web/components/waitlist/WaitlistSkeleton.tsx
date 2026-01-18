import { AUTH_FORM_MAX_WIDTH_CLASS } from '@/components/auth/constants';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

export function WaitlistSkeleton() {
  return (
    <div className='min-h-screen flex flex-col items-center bg-base px-4 pt-[18vh] sm:pt-[20vh] pb-24'>
      {/* Logo */}
      <div className='mb-6 h-12 w-12' aria-hidden='true' />

      {/* Form skeleton */}
      <div className={`w-full ${AUTH_FORM_MAX_WIDTH_CLASS} space-y-4`}>
        <LoadingSkeleton height='h-12' />
        <LoadingSkeleton height='h-12' />
        <LoadingSkeleton height='h-12' />
        <LoadingSkeleton height='h-12' />
        <LoadingSkeleton height='h-12' />
        <LoadingSkeleton height='h-12' />
      </div>

      <div
        className={`w-full ${AUTH_FORM_MAX_WIDTH_CLASS} flex items-center justify-between mt-6`}
      >
        <div className='h-4 w-10 rounded-md skeleton motion-reduce:animate-none' />
        <div className='flex items-center justify-center gap-2'>
          <div className='h-1.5 w-1.5 rounded-full skeleton motion-reduce:animate-none' />
          <div className='h-1.5 w-1.5 rounded-full skeleton motion-reduce:animate-none' />
          <div className='h-1.5 w-1.5 rounded-full skeleton motion-reduce:animate-none' />
          <div className='h-1.5 w-1.5 rounded-full skeleton motion-reduce:animate-none' />
          <div className='h-1.5 w-1.5 rounded-full skeleton motion-reduce:animate-none' />
        </div>
      </div>

      {/* Footer */}
      <div className='mt-8 h-4 w-40 rounded-md skeleton motion-reduce:animate-none' />
    </div>
  );
}
