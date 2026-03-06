import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

/**
 * Chat page loading skeleton.
 * Matches the JovieChat layout with a centered input area and empty message space.
 */
export default function ChatLoading() {
  return (
    <div
      className='flex h-full flex-col items-center justify-end pb-4'
      aria-busy='true'
      aria-live='polite'
    >
      <div className='w-full max-w-2xl space-y-3 px-4'>
        <LoadingSkeleton height='h-12' width='w-full' rounded='lg' />
        <div className='flex justify-center'>
          <LoadingSkeleton height='h-3' width='w-48' rounded='sm' />
        </div>
      </div>
    </div>
  );
}
