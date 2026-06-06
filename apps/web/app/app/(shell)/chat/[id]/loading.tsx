import { ChatWorkspaceSurface } from '@/components/jovie/ChatWorkspaceSurface';
import {
  ChatConversationComposerSkeleton,
  ChatMessageSkeleton,
} from '@/components/jovie/components/ChatMessageSkeleton';

/**
 * Chat conversation loading skeleton.
 * Shows message bubbles and input area matching the JovieChat conversation layout.
 */
export default function ChatConversationLoading() {
  return (
    <ChatWorkspaceSurface>
      <div
        className='system-b-chat-conversation-loading'
        aria-busy='true'
        aria-live='polite'
      >
        <div className='system-b-chat-conversation-loading-viewport'>
          <ChatMessageSkeleton />
        </div>
        <div className='system-b-chat-conversation-loading-dock'>
          <ChatConversationComposerSkeleton />
        </div>
      </div>
    </ChatWorkspaceSurface>
  );
}
