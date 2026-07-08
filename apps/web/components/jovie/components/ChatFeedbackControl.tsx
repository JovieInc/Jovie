'use client';

import { Button, SimpleTooltip } from '@jovie/ui';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import {
  recordThumbsDownRotation,
  undoThumbsDownRotation,
} from '@/lib/chat/model-rotation-store';
import { addBreadcrumb } from '@/lib/sentry/client-lite';
import { cn } from '@/lib/utils';

type FeedbackVote = 'up' | 'down';

export interface ChatFeedbackTarget {
  /** Chat message id (timeline/client id) the vote refers to. */
  readonly messageId: string;
  /** Persisted chat turn id — lets the server attribute the producing model. */
  readonly turnId?: string;
  readonly conversationId?: string;
  /** Tool call id when the vote targets a tool/skill result. */
  readonly toolCallId?: string;
  /** Tool/skill name when the vote targets a tool/skill result. */
  readonly toolName?: string;
  /** Client-side model fallback (server resolves from the turn when it can). */
  readonly modelUsed?: string;
  /** Short excerpt of the voted content — makes rows self-describing for Eve. */
  readonly excerpt?: string;
}

interface ChatFeedbackControlProps extends ChatFeedbackTarget {
  readonly className?: string;
}

const EXCERPT_MAX_LENGTH = 500;

async function postVote(
  target: ChatFeedbackTarget,
  vote: FeedbackVote | null
): Promise<boolean> {
  try {
    const response = await fetch('/api/chat/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        messageId: target.messageId,
        vote,
        ...(target.turnId ? { turnId: target.turnId } : {}),
        ...(target.conversationId
          ? { conversationId: target.conversationId }
          : {}),
        ...(target.toolCallId ? { toolCallId: target.toolCallId } : {}),
        ...(target.toolName ? { toolName: target.toolName } : {}),
        ...(target.modelUsed ? { modelUsed: target.modelUsed } : {}),
        ...(target.excerpt
          ? { messageExcerpt: target.excerpt.slice(0, EXCERPT_MAX_LENGTH) }
          : {}),
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 👍/👎 feedback control rendered beside every assistant message and every
 * tool/skill result in chat (JOV #11460). Votes persist to the in-app
 * feedback store with model attribution so the per-workflow A/B bake-off
 * can score models by real user signal.
 *
 * Optimistic + idempotent: clicking a vote applies instantly, clicking the
 * same vote again undoes it, and a failed request rolls the UI back.
 */
export function ChatFeedbackControl({
  className,
  ...target
}: ChatFeedbackControlProps) {
  const [vote, setVote] = useState<FeedbackVote | null>(null);
  const inFlightRef = useRef(false);

  const handleVote = useCallback(
    (nextVote: FeedbackVote) => {
      if (inFlightRef.current) return;
      const previousVote = vote;
      // Clicking the active vote undoes it.
      const resolvedVote = previousVote === nextVote ? null : nextVote;
      setVote(resolvedVote);
      // 👎 recovery loop (JOV-3362 / #11461): a thumbs-down rotates the
      // conversation's NEXT turn to a different model in the fallback chain.
      // Applied optimistically alongside the vote; rolled back with it.
      if (resolvedVote === 'down') {
        recordThumbsDownRotation(target.conversationId);
      } else if (previousVote === 'down') {
        // Undo or flip to 👍 — either way the dislike was retracted.
        undoThumbsDownRotation(target.conversationId);
      }
      inFlightRef.current = true;
      void postVote(target, resolvedVote).then(ok => {
        inFlightRef.current = false;
        if (!ok) {
          setVote(previousVote);
          if (resolvedVote === 'down') {
            undoThumbsDownRotation(target.conversationId);
          } else if (previousVote === 'down') {
            recordThumbsDownRotation(target.conversationId);
          }
          addBreadcrumb({
            category: 'ai-chat',
            message: 'chat_feedback_vote_failed',
            level: 'warning',
            data: {
              messageId: target.messageId,
              toolCallId: target.toolCallId,
            },
          });
        }
      });
    },
    [target, vote]
  );

  return (
    <div
      data-testid='chat-feedback-control'
      data-message-id={target.messageId}
      data-tool-call-id={target.toolCallId || undefined}
      data-vote={vote ?? undefined}
      className={cn('flex items-center', className)}
    >
      <SimpleTooltip
        content={vote === 'up' ? 'Remove rating' : 'Good response'}
      >
        <Button
          type='button'
          variant='ghost'
          size='icon'
          onClick={() => handleVote('up')}
          className='h-7 w-7 shadow-none'
          aria-label='Good response'
          aria-pressed={vote === 'up'}
          data-testid='chat-feedback-thumbs-up'
        >
          <ThumbsUp
            className={cn(
              'h-3.5 w-3.5',
              vote === 'up' ? 'text-accent-blue' : 'text-secondary-token'
            )}
            {...(vote === 'up' ? { fill: 'currentColor' } : {})}
          />
        </Button>
      </SimpleTooltip>
      <SimpleTooltip
        content={vote === 'down' ? 'Remove rating' : 'Bad response'}
      >
        <Button
          type='button'
          variant='ghost'
          size='icon'
          onClick={() => handleVote('down')}
          className='h-7 w-7 shadow-none'
          aria-label='Bad response'
          aria-pressed={vote === 'down'}
          data-testid='chat-feedback-thumbs-down'
        >
          <ThumbsDown
            className={cn(
              'h-3.5 w-3.5',
              vote === 'down' ? 'text-accent-blue' : 'text-secondary-token'
            )}
            {...(vote === 'down' ? { fill: 'currentColor' } : {})}
          />
        </Button>
      </SimpleTooltip>
    </div>
  );
}
