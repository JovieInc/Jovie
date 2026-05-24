import { Skeleton } from '@jovie/ui';
import { JovieMarkElectric } from '@/components/atoms/JovieMarkElectric';
import { ChatWorkspaceSurface } from '@/components/jovie/ChatWorkspaceSurface';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

/**
 * Chat page loading skeleton.
 * Matches the JovieChat empty state layout: centered logo space and composer.
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
          <div className='relative mx-auto flex min-h-full w-full max-w-[52rem] flex-1 flex-col items-center justify-center px-1 py-8'>
            <div
              className='pointer-events-none absolute left-1/2 top-1/2 h-[min(46vw,28rem)] w-[min(46vw,28rem)] -translate-x-1/2 -translate-y-[60%] opacity-45 max-sm:h-[min(72vw,18rem)] max-sm:w-[min(72vw,18rem)]'
              aria-hidden='true'
            >
              <JovieMarkElectric className='h-full w-full' />
            </div>

            {/* Input area skeleton */}
            <div className='relative z-10 w-full max-w-[45rem] space-y-2'>
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
              <Skeleton className='mx-auto h-3 w-32' rounded='lg' />
            </div>
          </div>
        </div>
      </div>
    </ChatWorkspaceSurface>
  );
}
