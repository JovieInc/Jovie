import { Skeleton } from '@jovie/ui';

/**
 * Skeleton loader that mimics the ChatMessage layout.
 * Shows one assistant and one user message bubble
 * to indicate a conversation is loading.
 */
export function ChatMessageSkeleton() {
  return (
    <div
      className='mx-auto max-w-[44rem] space-y-6 px-4 py-6'
      aria-hidden='true'
    >
      {/* Assistant message skeleton */}
      <div className='flex justify-start gap-3'>
        <Skeleton className='h-8 w-8 shrink-0 rounded-xl' rounded='lg' />
        <div className='max-w-[60%] space-y-2 rounded-[16px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) px-4 py-3.5'>
          <Skeleton className='h-4 w-[85%]' rounded='lg' />
          <Skeleton className='h-4 w-[70%]' rounded='lg' />
          <Skeleton className='h-4 w-[45%]' rounded='lg' />
        </div>
      </div>

      {/* User message skeleton */}
      <div className='flex justify-end gap-3'>
        <div className='max-w-[52%] space-y-2 rounded-[14px] bg-accent/90 px-4 py-3'>
          <Skeleton className='h-4 w-[75%] bg-white/25' rounded='lg' />
        </div>
      </div>
    </div>
  );
}
