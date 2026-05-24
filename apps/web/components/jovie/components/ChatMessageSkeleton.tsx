import { Skeleton } from '@jovie/ui';

/**
 * Skeleton loader that mimics the ChatMessage layout.
 * Shows one user message and one assistant reply, matching the final
 * user pill plus plain assistant text structure.
 */
export function ChatMessageSkeleton() {
  return (
    <div
      className='mx-auto max-w-[44rem] space-y-4 px-4 py-6'
      aria-hidden='true'
    >
      {/* User message skeleton */}
      <div className='flex justify-end'>
        <div className='flex min-h-7 max-w-[78%] items-center rounded-full border border-(--linear-app-frame-seam) bg-surface-2 px-3 py-1.5'>
          <Skeleton className='h-3.5 w-36' rounded='full' />
        </div>
      </div>

      {/* Assistant message skeleton */}
      <div className='flex justify-start'>
        <div className='w-full max-w-[78%] space-y-2 text-[15px] leading-7'>
          <div className='space-y-2 pl-0.5'>
            <Skeleton className='h-4 w-[85%]' rounded='lg' />
            <Skeleton className='h-4 w-[70%]' rounded='lg' />
            <Skeleton className='h-4 w-[45%]' rounded='lg' />
          </div>
        </div>
      </div>
    </div>
  );
}
