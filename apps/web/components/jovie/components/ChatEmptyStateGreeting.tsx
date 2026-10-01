import { getChatEmptyStateGreetingText } from '../chat-empty-greeting';
import { CHAT_CONTENT_SHELL_CLASSNAME } from '../chat-layout';

/**
 * New-chat empty state (JOV-7150): one greeting plus one real insight, left-
 * aligned in the composer-width column. Replaces the "Just ask" heading and
 * the chip/suggestion state — no cards, no chips. `insight` renders only
 * when the caller resolved a real one (see `resolveChatEmptyStateInsight`);
 * omitted, the greeting stands alone.
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
          {getChatEmptyStateGreetingText(firstName)}
        </h2>
        {insight ? (
          <p
            className='text-xl text-secondary-token'
            data-testid='chat-empty-state-insight'
          >
            {insight}
          </p>
        ) : null}
      </div>
    </div>
  );
}
