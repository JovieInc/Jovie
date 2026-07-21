'use client';

import { AlertCircle, ArrowRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Elevated empty-state / inbox CTA card.
 *
 * Quiet tool-call activity in the transcript uses the subordinate
 * `.system-b-chat-activity-*` pattern (indented, book weight, secondary
 * color) — not this surface. Keep action cards full-weight and unindented
 * so CTAs stay scannable; agent status steps stay visually quieter (issue 13897).
 */
interface ChatActionCardProps {
  readonly title: string;
  readonly body: string;
  readonly actionLabel: string;
  readonly onAct: () => void;
  readonly onDismiss: () => void;
  readonly className?: string;
}

export function ChatActionCard({
  title,
  body,
  actionLabel,
  onAct,
  onDismiss,
  className,
}: ChatActionCardProps) {
  return (
    <article
      className={cn('system-b-chat-action-card', className)}
      data-testid='chat-action-card'
    >
      <span className='system-b-chat-action-card-icon-shell' aria-hidden='true'>
        <AlertCircle
          className='system-b-chat-action-card-icon'
          strokeWidth={2.2}
        />
      </span>

      <div className='system-b-chat-action-card-copy'>
        <h2 className='system-b-chat-action-card-title'>{title}</h2>
        <p className='system-b-chat-action-card-body'>{body}</p>
        <button
          type='button'
          onClick={onAct}
          className='system-b-chat-action-card-primary'
        >
          {actionLabel}
          <ArrowRight
            className='system-b-chat-action-card-primary-icon'
            strokeWidth={2.5}
          />
        </button>
      </div>

      <button
        type='button'
        onClick={onDismiss}
        className='system-b-chat-action-card-dismiss focus-ring'
        aria-label={`Dismiss ${title}`}
      >
        <X
          className='system-b-chat-action-card-dismiss-icon'
          strokeWidth={2.25}
        />
      </button>
    </article>
  );
}
