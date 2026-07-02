'use client';

import { Button } from '@jovie/ui';

interface ChatArtifactErrorCardProps {
  readonly title: string;
  readonly message?: string;
  readonly retryPrompt?: string;
  readonly showRetry?: boolean;
}

function submitRetryPrompt(prompt: string): void {
  globalThis.dispatchEvent(
    new CustomEvent('jovie-chat-submit-prompt', {
      detail: { prompt },
    })
  );
}

export function ChatArtifactErrorCard({
  title,
  message,
  retryPrompt = 'Please try again.',
  showRetry = true,
}: ChatArtifactErrorCardProps) {
  return (
    <output
      data-testid='chat-artifact-error-card'
      className='system-b-chat-artifact-error'
    >
      <span className='system-b-chat-artifact-error-title'>{title}</span>
      {message ? (
        <p className='system-b-chat-artifact-error-message'>{message}</p>
      ) : null}
      {showRetry ? (
        <Button
          type='button'
          variant='ghost'
          size='sm'
          onClick={() => submitRetryPrompt(retryPrompt)}
          className='mt-2 h-7 px-2 text-2xs'
        >
          Retry
        </Button>
      ) : null}
    </output>
  );
}
