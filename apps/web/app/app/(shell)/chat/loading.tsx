import { Skeleton } from '@jovie/ui';
import { ChatWorkspaceSurface } from '@/components/jovie/ChatWorkspaceSurface';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

/**
 * Chat page loading skeleton.
 * Matches the JovieChat empty state layout: centered heading, action card, and input.
 */
export default function ChatLoading() {
  return (
    <ChatWorkspaceSurface>
      <div
        className='flex h-full flex-col'
        aria-busy='true'
        aria-live='polite'
        data-testid='chat-loading'
      >
        <div className='flex flex-1 flex-col items-center justify-center px-4 py-6 sm:px-6 sm:py-8'>
          <div className='mx-auto flex w-full max-w-[34rem] flex-1 flex-col items-center justify-center gap-5'>
            {/* Heading skeleton */}
            <Skeleton className='h-6 w-48' rounded='lg' />

            {/* Action card skeleton */}
            <div className='grid min-h-[148px] w-full max-w-[32rem] grid-cols-1 items-center gap-4 rounded-[18px] border border-white/[0.05] bg-(--linear-app-content-surface) px-5 py-5 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.45)] sm:grid-cols-[minmax(0,1fr)_auto] sm:px-7'>
              <div className='min-w-0'>
                <Skeleton className='h-4 w-56' rounded='lg' />
                <Skeleton className='mt-3 h-3 w-full' rounded='lg' />
                <Skeleton className='mt-2 h-3 w-4/5' rounded='lg' />
              </div>
              <div className='flex justify-start sm:justify-end'>
                <Skeleton className='h-7 w-24 rounded-full' rounded='full' />
              </div>
            </div>

            {/* Input area skeleton */}
            <div className='w-full max-w-[35rem] space-y-2'>
              <div className='overflow-hidden rounded-[24px] border border-black/6 bg-[color-mix(in_oklab,var(--linear-app-content-surface)_98%,var(--linear-bg-surface-0))] shadow-[0_1px_0_rgba(255,255,255,0.72),0_10px_22px_-20px_rgba(15,23,42,0.42)] dark:border-white/8'>
                <div className='relative flex items-end gap-2 px-3 py-2.5'>
                  <button
                    type='button'
                    disabled
                    aria-label='Attachment options'
                    className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-(--linear-app-frame-seam) bg-surface-0 text-secondary-token opacity-80'
                  >
                    <LoadingSkeleton height='h-4' width='w-4' rounded='full' />
                  </button>
                  <textarea
                    disabled
                    rows={1}
                    aria-label='Chat message input'
                    placeholder='Ask Jovie anything'
                    className='min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm leading-6 text-primary-token placeholder:text-tertiary-token focus:outline-none'
                  />
                  <button
                    type='button'
                    disabled
                    aria-label='Send message'
                    className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-(--linear-app-frame-seam) bg-surface-0 text-tertiary-token'
                  >
                    <LoadingSkeleton height='h-4' width='w-4' rounded='full' />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ChatWorkspaceSurface>
  );
}
