'use client';

import { ExternalLink, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/components/feedback';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { DrawerButton } from '@/components/molecules/drawer';
import type { SummerCard } from '@/lib/ovie/summer-cards';

const FETCH_URL = '/api/ovie/summer-cards?status=pending&limit=50';

const SUMMER_CARD_KIND_LABELS: Record<SummerCard['kind'], string> = {
  outbound: 'Outbound',
  spend: 'Spend',
  taste: 'Taste',
  decision: 'Decision',
};

interface SummerCardsResponse {
  readonly cards: readonly SummerCard[];
  readonly pendingCount: number;
}

interface ApiErrorResponse {
  readonly error?: string;
}

interface SummerCardsLoadError {
  readonly title: string;
  readonly detail: string;
}

interface PendingCommentState {
  readonly card: SummerCard;
}

function formatCreatedAt(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(new Date(value));
}

function formatAmount(amountUsd: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: amountUsd % 1 === 0 ? 0 : 2,
  }).format(amountUsd);
}

async function readApiError(response: Response): Promise<ApiErrorResponse> {
  try {
    return (await response.json()) as ApiErrorResponse;
  } catch {
    return {};
  }
}

function loadErrorFromResponse(
  response: Response,
  payload: ApiErrorResponse
): SummerCardsLoadError {
  if (response.status === 401) {
    return {
      title: 'Sign In Required',
      detail:
        payload.error ?? 'Sign in with an admin Ovie account, then retry.',
    };
  }
  if (response.status === 403) {
    return {
      title: 'Admin Access Required',
      detail:
        payload.error ??
        'Use an admin Ovie account or re-open Ovie after re-authentication, then retry.',
    };
  }
  return {
    title: 'Summer Cards Unavailable',
    detail:
      payload.error ?? `Summer cards could not load (${response.status}).`,
  };
}

function decisionErrorMessage(
  response: Response,
  payload: ApiErrorResponse
): string {
  if (response.status === 401) {
    return payload.error ?? 'Sign in to Ovie, then retry this decision.';
  }
  if (response.status === 403) {
    return (
      payload.error ??
      'Admin authorization failed. Re-open Ovie after re-authentication, then retry this decision.'
    );
  }
  if (response.status === 409) {
    return 'This card was already decided. Refreshing the inbox.';
  }
  return payload.error ?? `Decision failed (${response.status})`;
}

function SummerCardMeta({ card }: Readonly<{ readonly card: SummerCard }>) {
  const parts: string[] = [SUMMER_CARD_KIND_LABELS[card.kind]];
  if (card.recipient) parts.push(`to ${card.recipient}`);
  if (card.amountUsd !== null) parts.push(formatAmount(card.amountUsd));
  return (
    <p className='text-2xs text-tertiary-token'>
      {parts.join(' · ')} · {formatCreatedAt(card.createdAt)}
    </p>
  );
}

function SummerCardItem({
  card,
  isSubmitting,
  onApprove,
  onReject,
  onComment,
}: Readonly<{
  readonly card: SummerCard;
  readonly isSubmitting: boolean;
  readonly onApprove: (card: SummerCard) => void;
  readonly onReject: (card: SummerCard) => void;
  readonly onComment: (card: SummerCard) => void;
}>) {
  return (
    <ContentSurfaceCard data-testid={`summer-card-${card.id}`}>
      <div className='space-y-3 p-3'>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0 space-y-1'>
            <p className='text-app font-[560] text-primary-token'>
              {card.title}
            </p>
            <SummerCardMeta card={card} />
          </div>
        </div>

        <p className='text-app leading-6 text-secondary-token whitespace-pre-wrap'>
          {card.body}
        </p>

        <p className='text-xs text-secondary-token'>
          <span className='font-[560] text-primary-token'>
            Recommendation:{' '}
          </span>
          {card.recommendation}
        </p>

        {card.defaultIfSilent ? (
          <p className='text-xs text-tertiary-token'>
            If silent: {card.defaultIfSilent}
          </p>
        ) : null}

        {card.evidence.length > 0 ? (
          <ul
            className='space-y-1'
            data-testid={`summer-card-evidence-${card.id}`}
          >
            {card.evidence.map(url => (
              <li key={url}>
                <a
                  href={url}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='inline-flex items-center gap-1 break-all text-2xs text-secondary-token underline-offset-2 hover:text-primary-token hover:underline'
                >
                  {url}
                  <ExternalLink
                    className='h-3 w-3 shrink-0'
                    aria-hidden='true'
                  />
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        <div className='flex flex-wrap gap-2 border-t border-subtle pt-3'>
          <DrawerButton
            type='button'
            tone='primary'
            disabled={isSubmitting}
            onClick={() => onApprove(card)}
          >
            Approve
          </DrawerButton>
          <DrawerButton
            type='button'
            tone='secondary'
            disabled={isSubmitting}
            onClick={() => onReject(card)}
          >
            Reject
          </DrawerButton>
          <DrawerButton
            type='button'
            tone='secondary'
            disabled={isSubmitting}
            onClick={() => onComment(card)}
          >
            Comment
          </DrawerButton>
        </div>
      </div>
    </ContentSurfaceCard>
  );
}

function SummerCardsBody({
  isLoading,
  loadError,
  cards,
  submittingId,
  onRetry,
  onApprove,
  onReject,
  onComment,
}: Readonly<{
  readonly isLoading: boolean;
  readonly loadError: SummerCardsLoadError | null;
  readonly cards: readonly SummerCard[];
  readonly submittingId: string | null;
  readonly onRetry: () => void;
  readonly onApprove: (card: SummerCard) => void;
  readonly onReject: (card: SummerCard) => void;
  readonly onComment: (card: SummerCard) => void;
}>) {
  if (isLoading) {
    return (
      <div className='flex min-h-20 items-center gap-2 text-app text-secondary-token'>
        <Loader2 className='h-4 w-4 animate-spin' aria-hidden='true' />
        Loading Summer cards...
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className='grid min-h-20 gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3'
        role='alert'
        data-testid='summer-cards-error'
      >
        <div className='space-y-1'>
          <p className='text-app font-[560] text-primary-token'>
            {loadError.title}
          </p>
          <p className='text-xs text-secondary-token'>{loadError.detail}</p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <DrawerButton
            type='button'
            tone='secondary'
            aria-label='Retry Summer Cards'
            onClick={onRetry}
          >
            Retry
          </DrawerButton>
        </div>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <p className='text-app text-secondary-token'>No pending Summer cards.</p>
    );
  }

  return (
    <div className='grid gap-3'>
      {cards.map(card => (
        <SummerCardItem
          key={card.id}
          card={card}
          isSubmitting={submittingId === card.id}
          onApprove={onApprove}
          onReject={onReject}
          onComment={onComment}
        />
      ))}
    </div>
  );
}

export function SummerCardReviewPanel() {
  const [cards, setCards] = useState<readonly SummerCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<SummerCardsLoadError | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [pendingComment, setPendingComment] =
    useState<PendingCommentState | null>(null);
  const [commentDraft, setCommentDraft] = useState('');

  const loadCards = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(FETCH_URL, { cache: 'no-store' });
      if (!response.ok) {
        const nextError = loadErrorFromResponse(
          response,
          await readApiError(response)
        );
        setCards([]);
        setLoadError(nextError);
        return;
      }
      const payload = (await response.json()) as SummerCardsResponse;
      setCards(payload.cards.filter(card => card.status === 'pending'));
    } catch (error) {
      setCards([]);
      setLoadError({
        title: 'Summer Cards Unavailable',
        detail:
          error instanceof Error
            ? error.message
            : 'Summer cards could not load.',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  const submitDecision = useCallback(
    async (
      card: SummerCard,
      decision: 'approve' | 'reject',
      comment: string | null
    ) => {
      setSubmittingId(card.id);
      try {
        const response = await fetch(
          `/api/ovie/summer-cards/${encodeURIComponent(card.id)}/decision`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              comment ? { decision, comment } : { decision }
            ),
          }
        );

        if (!response.ok) {
          const payload = await readApiError(response);
          if (response.status === 409) {
            setCards(current => current.filter(item => item.id !== card.id));
          }
          throw new Error(decisionErrorMessage(response, payload));
        }

        setCards(current => current.filter(item => item.id !== card.id));
        toast.success(
          decision === 'approve'
            ? 'Summer card approved.'
            : 'Summer card rejected.'
        );
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Failed to record decision'
        );
      } finally {
        setSubmittingId(null);
        setPendingComment(null);
        setCommentDraft('');
      }
    },
    []
  );

  return (
    <>
      <ContentSurfaceCard
        surface='details'
        data-testid='summer-card-review-panel'
      >
        <div className='min-h-36 space-y-3 p-3'>
          <div className='flex items-center justify-between gap-3'>
            <div>
              <p
                id='summer-cards-heading'
                className='text-xs font-[560] text-primary-token'
              >
                Summer Approvals
              </p>
              <p className='text-xs text-secondary-token'>
                Approve or reject Summer&apos;s pending cards. Decisions are
                final.
              </p>
            </div>
            <span
              className='text-2xs tabular-nums text-tertiary-token'
              data-testid='summer-cards-pending-count'
            >
              {isLoading ? '...' : cards.length}
            </span>
          </div>

          <SummerCardsBody
            isLoading={isLoading}
            loadError={loadError}
            cards={cards}
            submittingId={submittingId}
            onRetry={() => {
              void loadCards();
            }}
            onApprove={next => {
              void submitDecision(next, 'approve', null);
            }}
            onReject={next => {
              void submitDecision(next, 'reject', null);
            }}
            onComment={next => {
              setPendingComment({ card: next });
              setCommentDraft('');
            }}
          />
        </div>
      </ContentSurfaceCard>

      {pendingComment ? (
        <div
          className='fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center'
          role='dialog'
          aria-modal='true'
          aria-label='Summer Card Comment'
        >
          <button
            type='button'
            aria-label='Close Comment Dialog'
            className='absolute inset-0 h-auto w-auto cursor-default rounded-none border-0 bg-transparent p-0'
            onClick={() => {
              if (submittingId) return;
              setPendingComment(null);
              setCommentDraft('');
            }}
          />
          <ContentSurfaceCard
            className='relative z-10 w-full max-w-lg'
            data-testid='summer-card-comment-dialog'
          >
            <div className='space-y-3 p-4'>
              <div className='space-y-1'>
                <p className='text-sm font-[560] text-primary-token'>
                  Comment on &ldquo;{pendingComment.card.title}&rdquo;
                </p>
                <p className='text-xs text-secondary-token'>
                  The comment is recorded with your decision.
                </p>
              </div>

              <textarea
                value={commentDraft}
                onChange={event => setCommentDraft(event.target.value)}
                rows={5}
                className='w-full rounded-lg border border-subtle bg-surface-0 px-3 py-2 text-app text-primary-token outline-none'
                placeholder='Add a comment for this decision'
              />

              <div className='flex justify-end gap-2'>
                <DrawerButton
                  type='button'
                  tone='secondary'
                  disabled={submittingId !== null}
                  onClick={() => {
                    setPendingComment(null);
                    setCommentDraft('');
                  }}
                >
                  Cancel
                </DrawerButton>
                <DrawerButton
                  type='button'
                  tone='secondary'
                  disabled={submittingId !== null}
                  onClick={() => {
                    void submitDecision(
                      pendingComment.card,
                      'reject',
                      commentDraft.trim() || null
                    );
                  }}
                >
                  Reject
                </DrawerButton>
                <DrawerButton
                  type='button'
                  tone='primary'
                  disabled={submittingId !== null}
                  onClick={() => {
                    void submitDecision(
                      pendingComment.card,
                      'approve',
                      commentDraft.trim() || null
                    );
                  }}
                >
                  Approve
                </DrawerButton>
              </div>
            </div>
          </ContentSurfaceCard>
        </div>
      ) : null}
    </>
  );
}
