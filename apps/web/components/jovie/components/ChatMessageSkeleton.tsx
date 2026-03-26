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
      <div className='flex justify-start gap-3'>
        <Skeleton className='h-8 w-8 shrink-0 rounded-xl' rounded='lg' />
        <div className='max-w-[60%] space-y-2 rounded-[16px] border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_98%,var(--linear-bg-surface-0))] px-4 py-3.5'>
          <Skeleton className='h-4 w-48' rounded='lg' />
          <Skeleton className='h-4 w-64' rounded='lg' />
          <Skeleton className='h-4 w-40' rounded='lg' />
        </div>
      </div>

      {/* User message skeleton */}
      <div className='flex justify-end gap-3'>
        <div className='max-w-[52%] space-y-2 rounded-[14px] bg-accent/90 px-4 py-3'>
          <Skeleton className='h-4 w-36 bg-white/25' rounded='lg' />
        </div>
      </div>

      {/* Assistant message skeleton */}
      <div className='flex justify-start gap-3'>
        <Skeleton className='h-8 w-8 shrink-0 rounded-xl' rounded='lg' />
        <div className='max-w-[60%] space-y-2 rounded-[16px] border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_98%,var(--linear-bg-surface-0))] px-4 py-3.5'>
          <Skeleton className='h-4 w-56' rounded='lg' />
          <Skeleton className='h-4 w-44' rounded='lg' />
        </div>
      </div>
    </div>
  );
}
