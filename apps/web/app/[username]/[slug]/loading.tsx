import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

export default function SmartLinkLoading() {
  return (
    <div className='flex min-h-screen flex-col items-center justify-center p-4'>
      <div className='w-full max-w-md space-y-6 text-center'>
        {/* Artwork skeleton */}
        <LoadingSkeleton
          height='h-64'
          width='w-64'
          rounded='lg'
          className='mx-auto'
        />
        {/* Title skeleton */}
        <LoadingSkeleton
          height='h-8'
          width='w-48'
          rounded='md'
          className='mx-auto'
        />
        {/* Artist skeleton */}
        <LoadingSkeleton
          height='h-5'
          width='w-32'
          rounded='md'
          className='mx-auto'
        />
        {/* Provider button skeletons */}
        <div className='space-y-3 pt-4'>
          <LoadingSkeleton height='h-12' width='w-full' rounded='lg' />
          <LoadingSkeleton height='h-12' width='w-full' rounded='lg' />
          <LoadingSkeleton height='h-12' width='w-full' rounded='lg' />
        </div>
      </div>
    </div>
  );
}
