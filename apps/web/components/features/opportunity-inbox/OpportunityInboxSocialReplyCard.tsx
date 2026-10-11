'use client';

import { ArrowRight, MessagesSquare } from 'lucide-react';
import { useId, useState } from 'react';
import { OpportunityCard } from '@/components/organisms/opportunity-card/OpportunityCard';
import { formatOpportunityInboxRelativeTime } from '@/lib/connectors/opportunity-inbox-time';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { cn } from '@/lib/utils';

export interface OpportunityInboxSocialReplyCardProps {
  readonly card: OpportunityInboxCardViewModel;
  readonly onApprove: (id: string) => void;
  readonly onDismiss: (id: string) => void;
  readonly onRevise: (id: string, comment: string) => void;
  readonly isApproving?: boolean;
  readonly isDismissing?: boolean;
  readonly isRevising?: boolean;
  readonly className?: string;
}

const EXECUTION_STATE_LABELS: Readonly<Record<string, string>> = {
  checking: 'Checking',
  sending: 'Sending',
  verified: 'Verified',
  blocked: 'Blocked',
  ambiguous: 'Needs Review',
};

export function OpportunityInboxSocialReplyCard({
  card,
  onApprove,
  onDismiss,
  onRevise,
  isApproving = false,
  isDismissing = false,
  isRevising = false,
  className,
}: OpportunityInboxSocialReplyCardProps) {
  const commentFieldId = useId();
  const [reviseOpen, setReviseOpen] = useState(false);
  const [comment, setComment] = useState('');
  const isBusy = isApproving || isDismissing || isRevising;
  const reply = card.socialReply;
  const relativeTime = formatOpportunityInboxRelativeTime(card.createdAt);

  if (!reply) return null;

  const executionLabel = EXECUTION_STATE_LABELS[reply.executionState];

  const submitRevision = () => {
    onRevise(card.id, comment.trim());
  };

  return (
    <OpportunityCard
      format='editorial'
      title={card.title}
      description={card.why}
      icon={
        <MessagesSquare
          aria-hidden='true'
          className='size-3.5 shrink-0 text-accent-teal'
        />
      }
      className={className}
      dataTestId={`opportunity-inbox-card-${card.id}`}
      metadata={
        <>
          <span className='system-b-opportunity-inbox-card-type text-accent-teal'>
            {reply.typeLabel}
          </span>
          <span
            aria-hidden='true'
            className='system-b-opportunity-inbox-card-dot'
          >
            ·
          </span>
          <span>{reply.platform}</span>
          {reply.videoTitle ? (
            <>
              <span
                aria-hidden='true'
                className='system-b-opportunity-inbox-card-dot'
              >
                ·
              </span>
              <span
                data-testid={`social-reply-video-${card.id}`}
                className='text-quaternary-token'
              >
                {reply.videoTitle}
              </span>
            </>
          ) : null}
          {typeof reply.likeCount === 'number' ? (
            <>
              <span
                aria-hidden='true'
                className='system-b-opportunity-inbox-card-dot'
              >
                ·
              </span>
              <span className='text-quaternary-token'>
                {reply.likeCount} {reply.likeCount === 1 ? 'like' : 'likes'}
              </span>
            </>
          ) : null}
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
          {executionLabel ? (
            <>
              <span
                aria-hidden='true'
                className='system-b-opportunity-inbox-card-dot'
              >
                ·
              </span>
              <span
                data-testid={`social-reply-execution-${reply.executionState}`}
                className='text-secondary-token'
              >
                {executionLabel}
              </span>
            </>
          ) : null}
        </>
      }
    >
      <blockquote
        data-testid={`social-reply-inbound-${card.id}`}
        className='border-subtle text-secondary-token border-l-2 pl-3 text-xs leading-relaxed'
      >
        <span className='text-quaternary-token'>{reply.authorLabel}: </span>
        {reply.inboundText}
      </blockquote>

      <div
        data-testid={`social-reply-draft-${card.id}`}
        className='border-subtle bg-surface-1 rounded-xl border p-3 text-xs leading-relaxed text-primary-token'
      >
        {reply.draftedText}
        {reply.revisionCount > 0 ? (
          <span className='text-quaternary-token ml-2'>
            · revision {reply.revisionCount + 1}
          </span>
        ) : null}
      </div>

      {reply.sourceUrl ? (
        <a
          href={reply.sourceUrl}
          target='_blank'
          rel='noreferrer'
          className='text-secondary-token text-2xs underline'
        >
          View original
        </a>
      ) : null}

      <div
        className={cn(
          'system-b-opportunity-inbox-comment-shell',
          reviseOpen && 'system-b-opportunity-inbox-comment-shell-open'
        )}
      >
        <label className='sr-only' htmlFor={commentFieldId}>
          Revision feedback for Jovie
        </label>
        <textarea
          id={commentFieldId}
          name='revisionFeedback'
          autoComplete='off'
          className='system-b-opportunity-inbox-comment-input'
          rows={2}
          value={comment}
          disabled={isBusy}
          placeholder='Tell Jovie how to revise this reply' // ui-casing-allow: design-locked inbox copy
          onChange={event => setComment(event.target.value)}
        />
        <button
          type='button'
          className='system-b-opportunity-inbox-comment-submit'
          disabled={isBusy || comment.trim().length < 5}
          onClick={submitRevision}
        >
          Request revision
        </button>
      </div>

      <div className='system-b-opportunity-inbox-card-actions'>
        <div className='flex items-center gap-1'>
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
            className='system-b-opportunity-inbox-dismiss'
            aria-expanded={reviseOpen}
            aria-controls={commentFieldId}
            disabled={isBusy}
            onClick={() => setReviseOpen(open => !open)}
          >
            Revise
          </button>
        </div>
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
    </OpportunityCard>
  );
}
