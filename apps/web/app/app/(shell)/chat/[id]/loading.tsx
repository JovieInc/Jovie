import { ChatWorkspaceSurface } from '@/components/jovie/ChatWorkspaceSurface';
import { CHAT_COMPOSER_DOCK_CLASSNAME } from '@/components/jovie/chat-layout';
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
        <div className={CHAT_COMPOSER_DOCK_CLASSNAME}>
          <div className='mx-auto max-w-2xl'>
            <LoadingSkeleton height='h-10' width='w-full' rounded='lg' />
          </div>
        </div>
      </div>
    </ChatWorkspaceSurface>
  );
}
