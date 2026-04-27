import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ThreadTurnProps {
  readonly speaker: 'jovie' | 'me';
  /** Quieter style for in-progress / system messages (e.g. "Generating…"). */
  readonly subtle?: boolean;
  readonly children: ReactNode;
}

/**
 * iMessage-style speaker turn — no labels, no avatars. Speaker reads from
 * alignment + bubble: `jovie` is flat-text full-width on the left,
 * `me` is a right-aligned rounded bubble. When `subtle` is set the turn
 * renders as flat text regardless of speaker, so an in-progress system
 * indicator never visually claims to be a user message.
 *
 * @example
 * ```tsx
 * <ThreadTurn speaker='jovie'>
 *   <ChatMarkdown content={message.body} />
 * </ThreadTurn>
 * <ThreadTurn speaker='me'>{userInput}</ThreadTurn>
 * ```
 */
export function ThreadTurn({ speaker, subtle, children }: ThreadTurnProps) {
  if (speaker === 'me' && !subtle) {
    return (
      <div className='flex justify-end'>
        <div className='max-w-[75%] rounded-2xl rounded-br-md px-3.5 py-2 text-[13.5px] leading-relaxed bg-(--surface-1)/80 text-primary-token'>
          {children}
        </div>
      </div>
    );
  }
  return (
    <div
      className={cn(
        'text-[13.5px] leading-relaxed',
        subtle ? 'text-tertiary-token' : 'text-secondary-token'
      )}
    >
      {children}
    </div>
  );
}
