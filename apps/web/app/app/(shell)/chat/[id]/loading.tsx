import { ChatWorkspaceSurface } from '@/components/jovie/ChatWorkspaceSurface';
import { ChatMessageSkeleton } from '@/components/jovie/components/ChatMessageSkeleton';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

/**
 * Chat conversation loading skeleton.
 * Shows message bubbles and input area matching the JovieChat layout.
 */
export default function ChatConversationLoading() {
  return (
    <ChatWorkspaceSurface>
      <div className='flex h-full flex-col' aria-busy='true' aria-live='polite'>
        <div className='flex-1'>
          <ChatMessageSkeleton />
        </div>
        <div className='border-t border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) px-4 pb-4 pt-4 sm:px-5 sm:pb-6'>
          <div className='mx-auto w-full max-w-2xl space-y-2'>
            <LoadingSkeleton height='h-10' width='w-full' rounded='lg' />
          </div>
        </div>
      </div>
    </ChatWorkspaceSurface>
  );
}
