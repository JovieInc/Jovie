import { ChatWorkspaceSurface } from '@/components/jovie/ChatWorkspaceSurface';
import { ChatMessageSkeleton } from '@/components/jovie/components/ChatMessageSkeleton';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

/**
 * Chat conversation loading skeleton.
 * Shows message bubbles and input area matching the JovieChat conversation layout.
 */
export default function ChatConversationLoading() {
  return (
    <ChatWorkspaceSurface>
      <div className='flex h-full flex-col' aria-busy='true' aria-live='polite'>
        <div className='flex-1 px-4 py-5 sm:px-5'>
          <ChatMessageSkeleton />
        </div>
        <div className='bg-(--linear-app-content-surface) px-4 pb-4 pt-2 sm:px-5 sm:pb-5 sm:pt-2.5'>
          <div className='mx-auto max-w-2xl'>
            <LoadingSkeleton height='h-10' width='w-full' rounded='lg' />
          </div>
        </div>
      </div>
    </ChatWorkspaceSurface>
  );
}
