import { Button } from '@jovie/ui';
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import {
  type ChatEmptyStateAction,
  getChatEmptyStateGreetingText,
} from '../chat-empty-greeting';
import { CHAT_CONTENT_SHELL_CLASSNAME } from '../chat-layout';

/**
 * One personal welcome and one useful next step. Insight prose is never
 * promoted to a verified success claim or substituted for the welcome.
 */
export function ChatEmptyStateGreeting({
  firstName,
  action,
  isLoading = false,
  onSelectAction,
}: {
  readonly firstName: string | null;
  /** Legacy playground's empty placeholder; unverified Insight prose is unsupported. */
  readonly insight?: null;
  readonly action?: ChatEmptyStateAction | null;
  readonly isLoading?: boolean;
  readonly onSelectAction?: (prompt: string) => void;
}) {
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
        <div
          className='min-h-24 w-full'
          data-testid='chat-empty-state-next-step'
        >
          {isLoading ? (
            <p className='text-sm text-secondary-token' role='status'>
              Finding your next step…
            </p>
          ) : action && onSelectAction ? (
            <div
              className='flex flex-col items-start gap-3'
              data-insight-id={action.insightId}
            >
              <p className='text-base text-secondary-token'>
                {action.suggestion}
              </p>
              <Button
                type='button'
                variant='secondary'
                onClick={() => onSelectAction(action.prompt)}
              >
                Draft This With Jovie
              </Button>
            </div>
          ) : (
            <Button variant='secondary' asChild>
              <Link href={APP_ROUTES.CHAT_PROFILE_PANEL}>
                Review Your Profile
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
