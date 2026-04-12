import { Skeleton } from '@jovie/ui';

/**
 * Skeleton loader that mimics the ChatMessage layout.
 * Shows one user message and one assistant reply bubble
 * matching the actual message structure (avatar + label above bubble).
 */
export function ChatMessageSkeleton() {
  return (
    <div
      className='mx-auto max-w-[44rem] space-y-4 px-4 py-6'
      aria-hidden='true'
    >
      {/* User message skeleton */}
      <div className='flex justify-end'>
        <div className='max-w-[78%] rounded-[18px] border border-(--linear-app-frame-seam) bg-surface-2 px-4 py-3.5'>
          <Skeleton className='h-4 w-40' rounded='lg' />
        </div>
      </div>

      {/* Assistant message skeleton */}
      <div className='flex justify-start'>
        <div className='max-w-[78%] space-y-1.5'>
          <div className='flex items-center gap-2 pl-0.5'>
            <Skeleton className='h-5.5 w-5.5 rounded-full' rounded='full' />
            <Skeleton className='h-3 w-8' rounded='sm' />
          </div>
          <div className='space-y-2 rounded-[18px] border border-subtle bg-surface-1 px-4 py-3.5'>
            <Skeleton className='h-4 w-[85%]' rounded='lg' />
            <Skeleton className='h-4 w-[70%]' rounded='lg' />
            <Skeleton className='h-4 w-[45%]' rounded='lg' />
          </div>
        </div>
      </div>
    </div>
  );
}
