'use client';

import type { ChatStarterConversation } from '@/lib/chat/new-chat-entry-contract';

interface ChatStarterConversationCardProps {
  readonly sample: ChatStarterConversation;
  readonly onSelect: (sample: ChatStarterConversation) => void;
}

export function ChatStarterConversationCard({
  sample,
  onSelect,
}: ChatStarterConversationCardProps) {
  return (
    <button
      type='button'
      onClick={() => onSelect(sample)}
      className='group grid w-full gap-2 rounded-2xl p-2 text-left transition-colors duration-subtle hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--app-shell-content-surface) motion-reduce:transition-none'
      aria-label={`Start conversation: ${sample.userPrompt}`}
      data-testid='chat-starter-conversation'
    >
      <span
        className='system-b-chat-user-bubble ml-auto text-app'
        data-bubble-shape='rectangle'
        data-message-role='user'
        data-testid='chat-starter-user-bubble'
      >
        {sample.userPrompt}
      </span>
      <span
        className='mr-auto max-w-(--system-b-chat-message-max-width) rounded-2xl rounded-bl-md border border-subtle bg-surface-1 px-3.5 py-2 text-app leading-relaxed text-primary-token transition-colors duration-subtle group-hover:border-default group-hover:bg-surface-2 motion-reduce:transition-none'
        data-message-role='assistant'
        data-testid='chat-starter-assistant-bubble'
      >
        {sample.assistantReply}
      </span>
    </button>
  );
}
