'use client';

import { Button } from '@jovie/ui';

import {
  Check,
  ExternalLink,
  Loader2,
  MessageSquareText,
  RefreshCw,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/components/feedback';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { DrawerButton } from '@/components/molecules/drawer';
import type { DesignProposal } from '@/lib/agent-os/design-lab/types';
import { cn } from '@/lib/utils';

const FETCH_URL = '/api/admin/design-lab/proposals';

interface DesignProposalsResponse {
  readonly proposals: readonly DesignProposal[];
  readonly fetchedAt: string;
}

interface ApiErrorResponse {
  readonly error?: string;
  readonly code?: string;
  readonly action?: string;
}

interface TasteInboxLoadError {
  readonly title: string;
  readonly detail: string;
}

interface PendingNotesState {
  readonly proposal: DesignProposal;
  readonly decision: 'no' | 'yes-with-notes';
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
): TasteInboxLoadError {
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
    title: 'Taste Inbox Unavailable',
    detail:
      payload.error ?? `Taste Inbox could not load (${response.status}).`,
  };
}

function loadErrorFromUnknown(error: unknown): TasteInboxLoadError {
  return {
    title: 'Taste Inbox Unavailable',
    detail:
      error instanceof Error ? error.message : 'Taste Inbox could not load.',
  };
}

function reviewErrorMessage(
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
    return payload.error ?? 'This proposal was already reviewed. Retry loading.';
  }

  return payload.error ?? `Review failed (${response.status})`;
}

function ProposalCard({
  proposal,
  isSubmitting,
  onApprove,
  onReject,
  onApproveWithNotes,
}: Readonly<{
  readonly proposal: DesignProposal;
  readonly isSubmitting: boolean;
  readonly onApprove: (proposal: DesignProposal) => void;
  readonly onReject: (proposal: DesignProposal) => void;
  readonly onApproveWithNotes: (proposal: DesignProposal) => void;
}>) {
  return (
    <ContentSurfaceCard
      className='space-y-3 p-3'
      data-testid={`design-proposal-card-${proposal.id}`}
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0 space-y-1'>
          <p className='text-app font-[560] text-primary-token'>
            {proposal.surfaceName}
          </p>
          <p className='text-2xs text-tertiary-token'>
            {proposal.surfaceId}
            {proposal.scoring
              ? ` · score ${proposal.scoring.score.toFixed(2)}`
              : null}
          </p>
        </div>
        {proposal.linearIssueUrl ? (
          <a
            href={proposal.linearIssueUrl}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex shrink-0 items-center gap-1 text-2xs text-secondary-token hover:text-primary-token'
          >
            {proposal.linearIssueId}
            <ExternalLink className='h-3 w-3' aria-hidden='true' />
          </a>
        ) : (
          <span className='text-2xs text-tertiary-token'>
            {proposal.linearIssueId}
          </span>
        )}
      </div>

      <p className='text-app leading-6 text-secondary-token'>
        {proposal.proposalText}
      </p>

      <p className='text-2xs text-tertiary-token'>
        Queued {formatCreatedAt(proposal.createdAt)}
      </p>

      <div className='flex flex-wrap gap-2 border-t border-subtle pt-3'>
        <DrawerButton
          type='button'
          tone='primary'
          disabled={isSubmitting}
          className='justify-center gap-1.5'
          onClick={() => onApprove(proposal)}
        >
          <Check className='h-3.5 w-3.5' aria-hidden='true' />
          Approve
        </DrawerButton>
        <DrawerButton
          type='button'
          tone='secondary'
          disabled={isSubmitting}
          className='justify-center gap-1.5'
          onClick={() => onApproveWithNotes(proposal)}
        >
          <MessageSquareText className='h-3.5 w-3.5' aria-hidden='true' />
          Approve With Notes
        </DrawerButton>
        <DrawerButton
          type='button'
          tone='secondary'
          disabled={isSubmitting}
          className='justify-center gap-1.5 text-destructive'
          onClick={() => onReject(proposal)}
        >
          <X className='h-3.5 w-3.5' aria-hidden='true' />
          Reject
        </DrawerButton>
      </div>
    </ContentSurfaceCard>
  );
}

export function DesignProposalReviewPanel() {
  const [proposals, setProposals] = useState<readonly DesignProposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<TasteInboxLoadError | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [pendingNotes, setPendingNotes] = useState<PendingNotesState | null>(
    null
  );
  const [notesDraft, setNotesDraft] = useState('');

  const loadProposals = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(FETCH_URL, { cache: 'no-store' });
      if (!response.ok) {
        const nextError = loadErrorFromResponse(
          response,
          await readApiError(response)
        );
        setLoadError(nextError);
        toast.error(nextError.detail);
        return;
      }
      const payload = (await response.json()) as DesignProposalsResponse;
      setProposals(payload.proposals);
    } catch (error) {
      const nextError = loadErrorFromUnknown(error);
      setLoadError(nextError);
      toast.error(nextError.detail);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProposals();
  }, [loadProposals]);

  const submitReview = useCallback(
    async (
      proposal: DesignProposal,
      decision: 'yes' | 'no' | 'yes-with-notes',
      notes: string | null
    ) => {
      if (!proposal.dayBucket) {
        toast.error('Proposal day bucket is missing.');
        return;
      }

      setSubmittingId(proposal.id);
      try {
        const response = await fetch(
          `/api/admin/design-lab/proposals/${encodeURIComponent(proposal.id)}/review`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dayBucket: proposal.dayBucket,
              decision,
              notes,
            }),
          }
        );

        const payload = (await response.json()) as {
          error?: string;
          code?: string;
          action?: string;
          result?: {
            dispatchTriggered: boolean;
            linearUpdated: boolean;
          };
        };

        if (!response.ok) {
          throw new Error(reviewErrorMessage(response, payload));
        }

        setProposals(current =>
          current.filter(item => item.id !== proposal.id)
        );

        if (decision === 'yes' || decision === 'yes-with-notes') {
          toast.success(
            payload.result?.dispatchTriggered
              ? 'Taste proposal approved and D5 dispatch triggered.'
              : 'Taste proposal approved.'
          );
        } else {
          toast.success('Taste proposal rejected and taste memory updated.');
        }

        if (payload.result?.linearUpdated === false) {
          toast.error('Linear issue status could not be updated.');
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Failed to review proposal'
        );
      } finally {
        setSubmittingId(null);
        setPendingNotes(null);
        setNotesDraft('');
      }
    },
    []
  );

  return (
    <>
      <ContentSurfaceCard
        surface='details'
        className='min-h-36 space-y-3 p-3'
        data-testid='design-proposal-review-panel'
      >
        <div className='flex items-center justify-between gap-3'>
          <div>
            <p
              id='taste-inbox-heading'
              className='text-xs font-[560] text-primary-token'
            >
              Taste Inbox
            </p>
            <p className='text-xs text-secondary-token'>
              Review agent-generated taste proposals before Summer ships or discards them.
            </p>
          </div>
          <span className='text-2xs tabular-nums text-tertiary-token'>
            {isLoading ? '...' : proposals.length}
          </span>
        </div>

        {isLoading ? (
          <div
            className='flex min-h-20 items-center gap-2 text-app text-secondary-token'
          >
            <Loader2 className='h-4 w-4 animate-spin' aria-hidden='true' />
            Loading Taste Inbox...
          </div>
        ) : loadError ? (
          <div
            className='grid min-h-20 gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3'
            role='alert'
            data-testid='taste-inbox-error'
          >
            <div className='space-y-1'>
              <p className='text-app font-[560] text-primary-token'>
                {loadError.title}
              </p>
              <p className='text-xs text-secondary-token'>
                {loadError.detail}
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <DrawerButton
                type='button'
                tone='secondary'
                className='justify-center gap-1.5'
                aria-label='Retry Taste Inbox'
                onClick={() => {
                  void loadProposals();
                }}
              >
                <RefreshCw className='h-3.5 w-3.5' aria-hidden='true' />
                Retry
              </DrawerButton>
            </div>
          </div>
        ) : proposals.length > 0 ? (
          <div className='grid gap-3'>
            {proposals.map(proposal => (
              <ProposalCard
                key={`${proposal.dayBucket ?? 'unknown'}:${proposal.id}`}
                proposal={proposal}
                isSubmitting={submittingId === proposal.id}
                onApprove={next => {
                  void submitReview(next, 'yes', null);
                }}
                onReject={next => {
                  setPendingNotes({ proposal: next, decision: 'no' });
                  setNotesDraft('');
                }}
                onApproveWithNotes={next => {
                  setPendingNotes({
                    proposal: next,
                    decision: 'yes-with-notes',
                  });
                  setNotesDraft('');
                }}
              />
            ))}
          </div>
        ) : (
          <p className='text-app text-secondary-token'>
            No pending taste proposals.
          </p>
        )}
      </ContentSurfaceCard>

      {pendingNotes ? (
        <div
          className='fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center'
          role='dialog'
          aria-modal='true'
          aria-label={
            pendingNotes.decision === 'no'
              ? 'Reject taste proposal'
              : 'Approve taste proposal with notes'
          }
        >
          <Button
            type='button'
            variant='ghost'
            aria-label='Close Review Notes Dialog'
            className='absolute inset-0 h-auto w-auto cursor-default rounded-none border-0 bg-transparent p-0 hover:bg-transparent'
            onClick={() => {
              if (submittingId) return;
              setPendingNotes(null);
              setNotesDraft('');
            }}
          />
          <ContentSurfaceCard
            className={cn(
              'relative z-10 w-full max-w-lg space-y-3 p-4',
              submittingId && 'pointer-events-none opacity-70'
            )}
            data-testid='design-proposal-notes-dialog'
          >
            <div className='space-y-1'>
              <p className='text-sm font-[560] text-primary-token'>
                {pendingNotes.decision === 'no'
                  ? 'Rejection Notes'
                  : 'Approval Notes'}
              </p>
              <p className='text-xs text-secondary-token'>
                {pendingNotes.decision === 'no'
                  ? 'Capture the rejected direction so Ovie does not resurface the same version.'
                  : 'Amendments are injected into the D5 dispatch payload.'}
              </p>
            </div>

            <textarea
              value={notesDraft}
              onChange={event => setNotesDraft(event.target.value)}
              rows={5}
              className='w-full rounded-lg border border-subtle bg-surface-0 px-3 py-2 text-app text-primary-token outline-none'
              placeholder='Add notes for this decision'
            />

            <div className='flex justify-end gap-2'>
              <DrawerButton
                type='button'
                tone='secondary'
                disabled={submittingId !== null}
                onClick={() => {
                  setPendingNotes(null);
                  setNotesDraft('');
                }}
              >
                Cancel
              </DrawerButton>
              <DrawerButton
                type='button'
                tone='primary'
                disabled={submittingId !== null}
                onClick={() => {
                  const notes = notesDraft.trim();
                  if (!notes) {
                    toast.error('Notes are required.');
                    return;
                  }
                  void submitReview(
                    pendingNotes.proposal,
                    pendingNotes.decision,
                    notes
                  );
                }}
              >
                {pendingNotes.decision === 'no'
                  ? 'Reject'
                  : 'Approve With Notes'}
              </DrawerButton>
            </div>
          </ContentSurfaceCard>
        </div>
      ) : null}
    </>
  );
}
