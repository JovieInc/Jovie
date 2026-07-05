'use client';

import { Button } from '@jovie/ui';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  CalendarDays,
  MessageSquare,
  Music2,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  UserRound,
} from 'lucide-react';
import { useId, useState } from 'react';
import type { OpportunitySignalType } from '@/lib/connectors/opportunity-inbox-signal-type';
import { formatOpportunityInboxRelativeTime } from '@/lib/connectors/opportunity-inbox-time';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { cn } from '@/lib/utils';

interface SignalTypeVisual {
  readonly icon: LucideIcon;
  /** Subtle accent on the meta icon+label only (accent discipline: no red/green). */
  readonly accentClassName: string;
}

const SIGNAL_TYPE_VISUALS: Readonly<
  Record<OpportunitySignalType, SignalTypeVisual>
> = {
  new_song: { icon: Music2, accentClassName: 'text-accent-blue' },
  new_event: { icon: CalendarDays, accentClassName: 'text-accent-purple' },
  new_profile_match: { icon: UserRound, accentClassName: 'text-accent-pink' },
  other: { icon: Sparkles, accentClassName: '' },
};

export interface OpportunityInboxCardProps {
  readonly card: OpportunityInboxCardViewModel;
  readonly onApprove: (id: string) => void;
  readonly onDismiss: (id: string) => void;
  readonly onFeedback: (
    id: string,
    rating: 'positive' | 'negative',
    comment?: string
  ) => void;
  readonly isApproving?: boolean;
  readonly isDismissing?: boolean;
  readonly isSubmittingFeedback?: boolean;
  readonly className?: string;
}

function SignalTypeIcon({
  signalType,
}: {
  readonly signalType: OpportunitySignalType;
}) {
  const visual = SIGNAL_TYPE_VISUALS[signalType];
  const Icon = visual.icon;
  return (
    <Icon
      aria-hidden='true'
      data-testid={`opportunity-inbox-signal-icon-${signalType}`}
      className={cn('size-3.5 shrink-0', visual.accentClassName)}
    />
  );
}

export function OpportunityInboxCard({
  card,
  onApprove,
  onDismiss,
  onFeedback,
  isApproving = false,
  isDismissing = false,
  isSubmittingFeedback = false,
  className,
}: OpportunityInboxCardProps) {
  const commentFieldId = useId();
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [selectedRating, setSelectedRating] = useState<
    'positive' | 'negative' | null
  >(null);
  const relativeTime = formatOpportunityInboxRelativeTime(card.createdAt);
  const isBusy = isApproving || isDismissing || isSubmittingFeedback;

  const submitFeedback = (rating: 'positive' | 'negative') => {
    setSelectedRating(rating);
    onFeedback(card.id, rating, comment.trim() || undefined);
  };

  const submitComment = () => {
    const rating = selectedRating ?? 'positive';
    onFeedback(card.id, rating, comment.trim() || undefined);
    setCommentOpen(false);
  };

  return (
    <article
      className={cn('system-b-opportunity-inbox-card', className)}
      data-testid={`opportunity-inbox-card-${card.id}`}
    >
      <header className='system-b-opportunity-inbox-card-meta'>
        <SignalTypeIcon signalType={card.signalType} />
        <span
          className={cn(
            'system-b-opportunity-inbox-card-type',
            SIGNAL_TYPE_VISUALS[card.signalType].accentClassName
          )}
        >
          {card.typeLabel}
        </span>
        <span
          aria-hidden='true'
          className='system-b-opportunity-inbox-card-dot'
        >
          ·
        </span>
        <time
          className='system-b-opportunity-inbox-card-time'
          dateTime={card.createdAt}
        >
          {relativeTime}
        </time>
      </header>

      <h2 className='system-b-opportunity-inbox-card-title'>{card.title}</h2>
      <p className='system-b-opportunity-inbox-card-why'>{card.why}</p>

      <div className='system-b-opportunity-inbox-card-feedback'>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className={cn(
            'h-7 w-7 border border-transparent',
            selectedRating === 'positive' &&
              'border-subtle bg-surface-1 text-primary-token'
          )}
          aria-label='Mark Suggestion Helpful'
          disabled={isBusy}
          onClick={() => submitFeedback('positive')}
        >
          <ThumbsUp className='system-b-opportunity-inbox-feedback-icon' />
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className={cn(
            'h-7 w-7 border border-transparent',
            selectedRating === 'negative' &&
              'border-subtle bg-surface-1 text-primary-token'
          )}
          aria-label='Mark Suggestion Not Helpful'
          disabled={isBusy}
          onClick={() => submitFeedback('negative')}
        >
          <ThumbsDown className='system-b-opportunity-inbox-feedback-icon' />
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className={cn(
            'h-7 w-7 border border-transparent',
            commentOpen && 'border-subtle bg-surface-1 text-primary-token'
          )}
          aria-expanded={commentOpen}
          aria-controls={commentFieldId}
          aria-label='Add Comment For Jovie'
          disabled={isBusy}
          onClick={() => setCommentOpen(open => !open)}
        >
          <MessageSquare className='system-b-opportunity-inbox-feedback-icon' />
        </Button>
      </div>

      <div
        className={cn(
          'system-b-opportunity-inbox-comment-shell',
          commentOpen && 'system-b-opportunity-inbox-comment-shell-open'
        )}
      >
        <label className='sr-only' htmlFor={commentFieldId}>
          Comment for Jovie
        </label>
        <textarea
          id={commentFieldId}
          className='system-b-opportunity-inbox-comment-input'
          rows={2}
          value={comment}
          disabled={isBusy}
          placeholder='Tell Jovie what to improve' // ui-casing-allow: design-locked inbox copy
          onChange={event => setComment(event.target.value)}
        />
        <button
          type='button'
          className='system-b-opportunity-inbox-comment-submit'
          disabled={isBusy || comment.trim().length < 5}
          onClick={submitComment}
        >
          Send comment
        </button>
      </div>

      <div className='system-b-opportunity-inbox-card-actions'>
        <button
          type='button'
          className='system-b-opportunity-inbox-dismiss'
          disabled={isBusy}
          onClick={() => onDismiss(card.id)}
        >
          Dismiss
        </button>
        <button
          type='button'
          className='system-b-opportunity-inbox-primary'
          disabled={isBusy}
          onClick={() => onApprove(card.id)}
        >
          {isApproving ? 'Approving…' : card.primaryActionLabel}
          <ArrowRight className='system-b-opportunity-inbox-primary-icon' />
        </button>
      </div>
    </article>
  );
}
