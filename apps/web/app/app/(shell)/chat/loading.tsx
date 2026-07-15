import { Skeleton } from '@jovie/ui';
import { JovieMarkElectric } from '@/components/atoms/JovieMarkElectric';
import { ChatWorkspaceSurface } from '@/components/jovie/ChatWorkspaceSurface';
import { CHAT_CONTENT_SHELL_CLASSNAME } from '@/components/jovie/chat-layout';
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
          <div
            className={`${CHAT_CONTENT_SHELL_CLASSNAME} relative flex min-h-full flex-1 flex-col items-center justify-center px-1 py-8`}
          >
            <div
              className='pointer-events-none absolute left-1/2 top-1/2 h-[min(46vw,28rem)] w-[min(46vw,28rem)] -translate-x-1/2 -translate-y-[60%] opacity-45 max-sm:h-[min(72vw,18rem)] max-sm:w-[min(72vw,18rem)]'
              aria-hidden='true'
            >
              <JovieMarkElectric className='h-full w-full' />
            </div>

            {/* Input area skeleton */}
            <div
              className={`${CHAT_CONTENT_SHELL_CLASSNAME} relative z-10 space-y-2`}
            >
              <div className='system-b-shell-loading-composer'>
                <div className='relative flex items-end gap-2 px-3 py-2.5'>
                  <button
                    type='button'
                    disabled
                    aria-label='Attachment Options'
                    className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-0 text-secondary-token opacity-80'
                  >
                    <LoadingSkeleton height='h-4' width='w-4' rounded='full' />
                  </button>
                  <div
                    aria-hidden='true'
                    className='min-w-0 flex-1 py-1.5 text-sm leading-6 text-tertiary-token'
                  >
                    What are you working on?
                  </div>
                  <button
                    type='button'
                    disabled
                    aria-label='Send Message'
                    className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-0 text-tertiary-token'
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
