import { ChatWorkspaceSurface } from '@/components/jovie/ChatWorkspaceSurface';
import { ChatMessageSkeleton } from '@/components/jovie/components/ChatMessageSkeleton';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

/**
 * Chat page loading skeleton.
 * Matches the JovieChat layout with a centered input area and empty message space.
 */
export default function ChatLoading() {
  return (
    <ChatWorkspaceSurface>
      <div className='flex h-full flex-col' aria-busy='true' aria-live='polite'>
        <div className='flex-1'>
          <ChatMessageSkeleton />
        </div>
        <div className='border-t border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) px-4 pb-4 pt-4 sm:px-5 sm:pb-6'>
          <div className='mx-auto w-full max-w-2xl space-y-3'>
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
                  className='min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[14px] leading-6 text-primary-token placeholder:text-tertiary-token focus:outline-none'
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
            <div className='flex justify-center'>
              <LoadingSkeleton height='h-3' width='w-40' rounded='sm' />
            </div>
          </div>
        </div>
      </div>
    </ChatWorkspaceSurface>
  );
}
