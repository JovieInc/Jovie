import { Button } from '@jovie/ui';
import Link from 'next/link';
import {
  type ChatEmptyStateResult,
  chatEmptyStateResultActionLabel,
  chatEmptyStateResultProblem,
  getChatEmptyStateGreetingText,
} from '../chat-empty-greeting';
import { CHAT_CONTENT_SHELL_CLASSNAME } from '../chat-layout';

/**
 * One personal welcome, and under it only work Jovie has already finished for
 * an item the artist owns (a draft to approve or a finding to open). With no
 * finished result there is nothing under the greeting: no chore, no canned
 * suggestion, no placeholder.
 */
export function ChatEmptyStateGreeting({
  firstName,
  result,
}: {
  readonly firstName: string | null;
  readonly result?: ChatEmptyStateResult | null;
}) {
  const showable =
    result && chatEmptyStateResultProblem(result) === null ? result : null;
  return (
    <div
      className={CHAT_CONTENT_SHELL_CLASSNAME}
      data-testid='chat-empty-state-greeting-region'
    >
      <div className='flex w-full flex-col items-start gap-4 text-left'>
        <h2
          className='text-2xl font-medium text-primary-token sm:text-3xl'
          data-testid='chat-empty-state-greeting-text'
        >
          {getChatEmptyStateGreetingText(firstName)}
        </h2>
        {showable ? (
          <div
            className='flex flex-col items-start gap-3'
            data-testid='chat-empty-state-result'
            data-result-id={showable.id}
          >
            <p className='text-base text-secondary-token'>
              {showable.result.summary}
            </p>
            <Button variant='secondary' asChild>
              <Link href={showable.result.href}>
                {chatEmptyStateResultActionLabel(showable)}
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
