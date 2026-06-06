import { Skeleton } from '@jovie/ui';

/**
 * Skeleton loader that mimics the ChatMessage layout.
 * Shows one user message and one assistant reply, matching the final
 * user pill plus plain assistant text structure.
 */
export function ChatMessageSkeleton() {
  return (
    <div className='system-b-chat-message-skeleton' aria-hidden='true'>
      {/* User message skeleton */}
      <div className='system-b-chat-message-skeleton-user-row'>
        <div className='system-b-chat-message-skeleton-user-bubble'>
          <Skeleton
            className='system-b-chat-message-skeleton-user-line'
            rounded='full'
          />
        </div>
      </div>

      {/* Assistant message skeleton */}
      <div className='system-b-chat-message-skeleton-assistant-row'>
        <div className='system-b-chat-message-skeleton-assistant-frame'>
          <Skeleton
            className='system-b-chat-message-skeleton-line system-b-chat-message-skeleton-line-wide'
            rounded='lg'
          />
          <Skeleton
            className='system-b-chat-message-skeleton-line system-b-chat-message-skeleton-line-medium'
            rounded='lg'
          />
          <Skeleton
            className='system-b-chat-message-skeleton-line system-b-chat-message-skeleton-line-short'
            rounded='lg'
          />
        </div>
      </div>
    </div>
  );
}

export function ChatConversationComposerSkeleton() {
  return (
    <div
      className='system-b-chat-conversation-loading-composer'
      aria-hidden='true'
      data-testid='chat-conversation-composer-skeleton'
    >
      <div className='system-b-chat-conversation-loading-composer-grid'>
        <div className='system-b-chat-conversation-loading-composer-title' />
        <div className='system-b-chat-conversation-loading-composer-actions'>
          <div className='system-b-chat-conversation-loading-composer-action' />
          <div className='system-b-chat-conversation-loading-composer-action-group'>
            <div className='system-b-chat-conversation-loading-composer-action' />
            <div className='system-b-chat-conversation-loading-composer-action system-b-chat-conversation-loading-composer-action-primary' />
          </div>
        </div>
      </div>
    </div>
  );
}
