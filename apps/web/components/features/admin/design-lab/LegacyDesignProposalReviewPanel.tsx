'use client';

import { ExternalLink, Loader2 } from 'lucide-react';
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
          className='justify-center'
          onClick={() => onApprove(proposal)}
        >
          Yes
        </DrawerButton>
        <DrawerButton
          type='button'
          tone='secondary'
          disabled={isSubmitting}
          className='justify-center'
          onClick={() => onApproveWithNotes(proposal)}
        >
          Yes with notes
        </DrawerButton>
        <DrawerButton
          type='button'
          tone='secondary'
          disabled={isSubmitting}
          className='justify-center text-destructive'
          onClick={() => onReject(proposal)}
        >
          No
        </DrawerButton>
      </div>
    </ContentSurfaceCard>
  );
}

export function DesignProposalReviewPanel() {
  const [proposals, setProposals] = useState<readonly DesignProposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [pendingNotes, setPendingNotes] = useState<PendingNotesState | null>(
    null
  );
  const [notesDraft, setNotesDraft] = useState('');

  const loadProposals = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(FETCH_URL, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Failed to load proposals (${response.status})`);
      }
      const payload = (await response.json()) as DesignProposalsResponse;
      setProposals(payload.proposals);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to load design proposals'
      );
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
          result?: {
            dispatchTriggered: boolean;
            linearUpdated: boolean;
          };
        };

        if (!response.ok) {
          throw new Error(
            payload.error ?? `Review failed (${response.status})`
          );
        }

        setProposals(current =>
          current.filter(item => item.id !== proposal.id)
        );

        if (decision === 'yes' || decision === 'yes-with-notes') {
          toast.success(
            payload.result?.dispatchTriggered
              ? 'Proposal approved and D5 dispatch triggered.'
              : 'Proposal approved.'
          );
        } else {
          toast.success('Proposal rejected and taste memory updated.');
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

  if (isLoading) {
    return (
      <ContentSurfaceCard
        surface='details'
        className='flex items-center gap-2 p-3 text-app text-secondary-token'
        data-testid='design-proposal-review-panel'
      >
        <Loader2 className='h-4 w-4 animate-spin' aria-hidden='true' />
        Loading design proposals...
      </ContentSurfaceCard>
    );
  }

  return (
    <>
      <ContentSurfaceCard
        surface='details'
        className='space-y-3 p-3'
        data-testid='design-proposal-review-panel'
      >
        <div className='flex items-center justify-between gap-3'>
          <div>
            <p className='text-xs font-[560] text-primary-token'>
              Design proposals
            </p>
            <p className='text-xs text-secondary-token'>
              Review pending Design Lab proposals before dispatch.
            </p>
          </div>
          <span className='text-2xs tabular-nums text-tertiary-token'>
            {proposals.length}
          </span>
        </div>

        {proposals.length > 0 ? (
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
            No pending design proposals.
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
              ? 'Reject design proposal'
              : 'Approve design proposal with notes'
          }
        >
          <button
            type='button'
            aria-label='Close Review Notes Dialog'
            className='absolute inset-0 cursor-default'
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
                  ? 'Rejection notes'
                  : 'Approval notes'}
              </p>
              <p className='text-xs text-secondary-token'>
                {pendingNotes.decision === 'no'
                  ? 'Capture the direction to reject so Design Lab does not regenerate it.'
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
                  : 'Approve with notes'}
              </DrawerButton>
            </div>
          </ContentSurfaceCard>
        </div>
      ) : null}
    </>
  );
}
