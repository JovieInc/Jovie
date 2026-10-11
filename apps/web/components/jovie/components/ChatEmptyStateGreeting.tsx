import { getChatEmptyStateGreetingText } from '../chat-empty-greeting';
import { CHAT_CONTENT_SHELL_CLASSNAME } from '../chat-layout';

/**
 * New-chat empty state (JOV-7150): one real insight or a personal greeting,
 * left-aligned in the composer-width column. The caller resolves a truthful
 * insight (see `resolveChatEmptyStateInsight`); without one, show the greeting.
 */
export function ChatEmptyStateGreeting({
  firstName,
  insight,
}: {
  readonly firstName: string | null;
  readonly insight?: string | null;
}) {
  return (
    <div
      className={CHAT_CONTENT_SHELL_CLASSNAME}
      data-testid='chat-empty-state-greeting-region'
    >
      <div className='flex w-full flex-col items-start gap-4 text-left'>
        <h2
          className='text-4xl font-medium text-primary-token'
          data-testid='chat-empty-state-greeting-text'
        >
          {insight || getChatEmptyStateGreetingText(firstName)}
        </h2>
      </div>
    </div>
  );
}
