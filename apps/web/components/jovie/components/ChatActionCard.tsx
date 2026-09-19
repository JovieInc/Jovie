'use client';

import { ArrowRight, X } from 'lucide-react';
import { Icon, type IconName } from '@/components/atoms/Icon';
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
  readonly icon?: IconName | string;
  readonly body: string;
  readonly actionLabel: string;
  readonly ariaLabel?: string;
  readonly onAct: () => void;
  readonly onDismiss: () => void;
  readonly className?: string;
}

export function ChatActionCard({
  title,
  icon = 'AlertCircle',
  body,
  actionLabel,
  ariaLabel,
  onAct,
  onDismiss,
  className,
}: ChatActionCardProps) {
  return (
    <article
      className={cn('system-b-chat-action-card', className)}
      data-testid='chat-action-card'
      data-starter-action-surface='primary'
    >
      <span className='system-b-chat-action-card-icon-shell' aria-hidden='true'>
        <Icon
          name={icon}
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
          aria-label={ariaLabel ?? actionLabel}
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
