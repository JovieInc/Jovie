import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

export default function ErrorPageLoading() {
  return (
    <div className='fixed inset-0 isolate flex flex-col items-center bg-page text-primary-token overflow-y-auto overflow-x-clip [color-scheme:dark] px-4 sm:px-6 pt-10 pb-10 sm:pt-14 sm:pb-12'>
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
        {/* Logo skeleton */}
        <div className='mb-6 sm:mb-8'>
          <LoadingSkeleton height='h-8' width='w-8' rounded='full' />
        </div>

        {/* Title skeleton */}
        <div className='mb-6'>
          <LoadingSkeleton height='h-5' width='w-48' />
        </div>

        {/* Error content skeleton */}
        <div className='w-full space-y-5'>
          <LoadingSkeleton
            className='mx-auto'
            height='h-12'
            width='w-12'
            rounded='full'
          />
          <LoadingSkeleton lines={2} height='h-4' width='w-full' />
          <div className='flex flex-col gap-2 sm:flex-row'>
            <LoadingSkeleton height='h-10' width='w-full' rounded='full' />
            <LoadingSkeleton height='h-10' width='w-full' rounded='full' />
          </div>
          <LoadingSkeleton className='mx-auto' height='h-3' width='w-40' />
        </div>
      </div>
    </div>
  );
}
