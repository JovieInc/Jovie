import { Skeleton } from '@jovie/ui';

/**
 * Skeleton loader that mimics the ChatMessage layout.
 * Shows alternating assistant (left) and user (right) message bubbles
 * to indicate a conversation is loading.
 */
export function ChatMessageSkeleton() {
  return (
    <div className='mx-auto max-w-2xl space-y-6 px-4 py-6' aria-hidden='true'>
      {/* Assistant message skeleton */}
      <div className='flex gap-3 justify-start'>
        <Skeleton className='h-8 w-8 shrink-0' rounded='lg' />
        <div className='max-w-[60%] space-y-2'>
          <Skeleton className='h-4 w-48' rounded='lg' />
          <Skeleton className='h-4 w-64' rounded='lg' />
          <Skeleton className='h-4 w-40' rounded='lg' />
        </div>
      </div>

      {/* User message skeleton */}
      <div className='flex gap-3 justify-end'>
        <Skeleton className='h-4 w-36 rounded-2xl' rounded='lg' />
        <Skeleton className='h-8 w-8 shrink-0' rounded='lg' />
      </div>

      {/* Assistant message skeleton */}
      <div className='flex gap-3 justify-start'>
        <Skeleton className='h-8 w-8 shrink-0' rounded='lg' />
        <div className='max-w-[60%] space-y-2'>
          <Skeleton className='h-4 w-56' rounded='lg' />
          <Skeleton className='h-4 w-44' rounded='lg' />
        </div>
      </div>
    </div>
  );
}
