'use client';

import { Badge, Button } from '@jovie/ui';
import { Check, FileCheck2, Pencil, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  INVESTOR_UPDATE_RECIPIENT_ROLES,
  type InvestorUpdateDecision,
  type InvestorUpdateRecipientRole,
  type InvestorUpdateRecipientSegment,
  type InvestorUpdateReviewState,
} from '@/lib/investors/update-contract';
import { cn } from '@/lib/utils';

const ROLE_LABELS: Record<InvestorUpdateRecipientRole, string> = {
  investor: 'Investors',
  advisor: 'Advisors',
  founder_self: 'Founder self-copy',
  other_explicit: 'Other explicitly selected',
};

function defaultSegments(): InvestorUpdateRecipientSegment[] {
  return INVESTOR_UPDATE_RECIPIENT_ROLES.map(role => ({
    role,
    included: false,
    recipientCount: 0,
  }));
}

function ApprovalStatus({
  approvalIsCurrent,
  error,
  latestApproval,
}: Readonly<{
  approvalIsCurrent: boolean;
  error: string | null;
  latestApproval: InvestorUpdateReviewState['latestApproval'];
}>) {
  if (error) {
    return <p className='text-sm text-destructive'>{error}</p>;
  }
  if (approvalIsCurrent && latestApproval) {
    return (
      <p className='flex items-start gap-2 text-sm text-success'>
        <ShieldCheck className='mt-0.5 h-4 w-4 shrink-0' />
        Exact copy and {latestApproval.recipientCount} recipients approved until{' '}
        {new Date(latestApproval.expiresAt).toLocaleTimeString()}. This did not
        send anything.
      </p>
    );
  }
  if (latestApproval) {
    return (
      <p className='text-sm text-warning'>
        The latest approval is expired or no longer matches this draft.
      </p>
    );
  }
  return (
    <p className='text-xs text-secondary-token'>
      Open/click tracking is off. This action only records manual final
      approval; it has no provider or send transition.
    </p>
  );
}

export function InvestorUpdateReview({
  initialState,
}: Readonly<{ initialState: InvestorUpdateReviewState }>) {
  const [state, setState] = useState(initialState);
  const [segments, setSegments] = useState<InvestorUpdateRecipientSegment[]>(
    initialState.latestApproval
      ? [...initialState.latestApproval.recipientSegments]
      : defaultSegments()
  );
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(
    null
  );
  const [editedClaim, setEditedClaim] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revising, setRevising] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const recipientCount = segments.reduce(
    (total, segment) => total + segment.recipientCount,
    0
  );
  const pendingDecisionCount =
    state.composition?.pendingCandidateIds.length ?? 0;
  const approvalReady =
    Boolean(state.draft && state.composition) &&
    pendingDecisionCount === 0 &&
    recipientCount > 0;
  const approvalSegmentsMatch =
    state.latestApproval?.recipientCount === recipientCount &&
    state.latestApproval.recipientSegments.every(approved => {
      const current = segments.find(segment => segment.role === approved.role);
      return (
        current?.included === approved.included &&
        current.recipientCount === approved.recipientCount
      );
    });
  const approvalIsCurrent =
    state.latestApproval?.matchesCurrentDraft === true &&
    approvalSegmentsMatch &&
    Date.parse(state.latestApproval.expiresAt) >= nowMs;

  useEffect(() => {
    if (!state.latestApproval) return;
    const remaining = Date.parse(state.latestApproval.expiresAt) - Date.now();
    if (remaining <= 0) return;
    const delay = Math.min(60_000, remaining + 50);
    const timer = window.setTimeout(() => setNowMs(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [nowMs, state.latestApproval]);

  async function mutate(body: Record<string, unknown>) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/investors/updates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as InvestorUpdateReviewState & {
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? 'Update failed.');
      setState(result);
      setNowMs(Date.now());
      setRevising(false);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : 'Update failed.'
      );
    } finally {
      setPending(false);
    }
  }

  async function decide(
    candidateId: string,
    decision: InvestorUpdateDecision,
    replacement: string | null = null
  ) {
    if (!state.draft) return;
    await mutate({
      action: 'candidate_decision',
      draftId: state.draft.id,
      candidateId,
      decision,
      editedClaim: replacement,
    });
    setEditingCandidateId(null);
    setEditedClaim('');
  }

  function updateSegment(
    role: InvestorUpdateRecipientRole,
    included: boolean,
    count: number
  ) {
    setSegments(current =>
      current.map(segment =>
        segment.role === role
          ? {
              ...segment,
              included,
              recipientCount: included ? Math.max(1, count) : 0,
            }
          : segment
      )
    );
  }

  if (!state.draft) {
    return (
      <ContentSurfaceCard className='p-6 text-app text-secondary-token'>
        No monthly draft exists yet. Source-backed agents can add candidates;
        this surface does not infer wins or create claims without receipts.
      </ContentSurfaceCard>
    );
  }

  return (
    <div className='grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)]'>
      <section aria-labelledby='candidate-heading' className='min-w-0'>
        <div className='mb-3 flex items-end justify-between gap-3'>
          <div>
            <h2
              id='candidate-heading'
              className='text-sm font-semibold text-primary-token'
            >
              Candidate Wins And Asks
            </h2>
            <p className='mt-1 text-xs text-secondary-token'>
              Ranked by relevance. Every item stays out until decided.
            </p>
          </div>
          <Badge variant={pendingDecisionCount === 0 ? 'success' : 'secondary'}>
            {pendingDecisionCount} Undecided
          </Badge>
        </div>

        <ContentSurfaceCard className='divide-y divide-subtle overflow-hidden p-0'>
          {state.candidates.length === 0 ? (
            <div className='p-6 text-app text-secondary-token'>
              No source-backed candidates yet.
            </div>
          ) : (
            state.candidates.map(candidate => {
              const decision = candidate.decision?.decision;
              const isEditing = editingCandidateId === candidate.id;
              return (
                <article
                  key={candidate.id}
                  className='p-4'
                  data-testid='investor-update-candidate'
                >
                  <div className='flex flex-wrap items-center gap-2'>
                    <Badge
                      variant={
                        candidate.kind === 'ask' ? 'warning' : 'secondary'
                      }
                    >
                      {candidate.kind === 'ask' ? 'Ask' : 'Win'}
                    </Badge>
                    <span className='text-xs font-medium text-secondary-token'>
                      {candidate.category.replaceAll('_', ' ')}
                    </span>
                    <span className='ml-auto font-mono text-xs tabular-nums text-secondary-token'>
                      {Math.round(candidate.relevanceScore * 100)} relevance
                    </span>
                  </div>
                  <div className='mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]'>
                    <div className='min-w-0'>
                      <p className='text-sm font-semibold text-primary-token'>
                        {candidate.metricLabel}: {candidate.metricValue}{' '}
                        {candidate.metricUnit}
                      </p>
                      <p className='mt-1 text-xs text-secondary-token'>
                        {new Date(candidate.windowStart).toLocaleDateString()}–
                        {new Date(candidate.windowEnd).toLocaleDateString()} ·{' '}
                        {Math.round(candidate.confidence * 100)}% confidence
                      </p>
                      <p className='mt-2 text-sm text-primary-token'>
                        {candidate.proposedClaim}
                      </p>
                      <p className='mt-2 break-words text-xs text-secondary-token'>
                        Source: {candidate.sourceLabel} · observed{' '}
                        {new Date(candidate.sourceObservedAt).toLocaleString()}
                      </p>
                      {candidate.caveats.length > 0 && (
                        <p className='mt-1 text-xs text-warning'>
                          Caveat: {candidate.caveats.join(' ')}
                        </p>
                      )}
                    </div>
                    {decision && (
                      <Badge
                        variant={
                          decision === 'exclude' ? 'secondary' : 'success'
                        }
                        className='self-start'
                      >
                        {decision === 'edit' ? 'Edited' : decision}
                      </Badge>
                    )}
                  </div>
                  {isEditing && (
                    <textarea
                      aria-label='Exact Edited Investor-facing Claim'
                      className='mt-3 min-h-24 w-full resize-y rounded-md border border-subtle bg-surface-1 px-3 py-2 text-sm text-primary-token outline-none focus-visible:ring-2 focus-visible:ring-focus'
                      value={editedClaim}
                      onChange={event => setEditedClaim(event.target.value)}
                    />
                  )}
                  <div className='mt-3 flex flex-wrap gap-2'>
                    <Button
                      size='sm'
                      variant='secondary'
                      disabled={pending || (approvalIsCurrent && !revising)}
                      onClick={() => decide(candidate.id, 'share')}
                    >
                      <Check className='mr-1.5 h-3.5 w-3.5' /> Share
                    </Button>
                    <Button
                      size='sm'
                      variant='secondary'
                      disabled={pending || (approvalIsCurrent && !revising)}
                      onClick={() => decide(candidate.id, 'exclude')}
                    >
                      <X className='mr-1.5 h-3.5 w-3.5' /> Exclude
                    </Button>
                    <Button
                      size='sm'
                      variant='secondary'
                      disabled={pending || (approvalIsCurrent && !revising)}
                      onClick={() => {
                        setEditingCandidateId(candidate.id);
                        setEditedClaim(
                          candidate.decision?.editedClaim ??
                            candidate.proposedClaim
                        );
                      }}
                    >
                      <Pencil className='mr-1.5 h-3.5 w-3.5' /> Edit
                    </Button>
                    {isEditing && (
                      <Button
                        size='sm'
                        disabled={pending || editedClaim.trim().length === 0}
                        onClick={() =>
                          decide(candidate.id, 'edit', editedClaim.trim())
                        }
                      >
                        Use Exact Edit
                      </Button>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </ContentSurfaceCard>
      </section>

      <aside
        className='min-w-0 xl:sticky xl:top-4 xl:self-start'
        aria-labelledby='draft-heading'
      >
        <ContentSurfaceCard className='p-4'>
          <div className='flex items-start gap-3'>
            <FileCheck2 className='mt-0.5 h-4 w-4 text-secondary-token' />
            <div className='min-w-0'>
              <h2
                id='draft-heading'
                className='text-sm font-semibold text-primary-token'
              >
                Monthly Draft
              </h2>
              <p className='mt-1 text-xs text-secondary-token'>
                Updated {new Date(state.draft.updatedAt).toLocaleString()}
              </p>
            </div>
          </div>
          <pre className='mt-4 max-h-96 min-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-surface-0 p-3 font-sans text-sm leading-6 text-primary-token'>
            {state.composition?.renderedCopy}
          </pre>

          <fieldset className='mt-4 border-t border-subtle pt-4'>
            <legend className='text-sm font-semibold text-primary-token'>
              Exact recipient roles and count
            </legend>
            <div className='mt-2 space-y-2'>
              {segments.map(segment => (
                <label
                  key={segment.role}
                  className='flex min-h-11 items-center gap-3 text-sm'
                >
                  <input
                    type='checkbox'
                    disabled={approvalIsCurrent && !revising}
                    checked={segment.included}
                    onChange={event =>
                      updateSegment(
                        segment.role,
                        event.target.checked,
                        segment.recipientCount
                      )
                    }
                  />
                  <span className='min-w-0 flex-1 text-primary-token'>
                    {ROLE_LABELS[segment.role]}
                  </span>
                  <input
                    aria-label={`${ROLE_LABELS[segment.role]} recipient count`}
                    type='number'
                    min={segment.included ? 1 : 0}
                    disabled={
                      !segment.included || (approvalIsCurrent && !revising)
                    }
                    className='h-9 w-20 rounded-md border border-subtle bg-surface-1 px-2 text-right font-mono text-sm tabular-nums disabled:opacity-50'
                    value={segment.recipientCount}
                    onChange={event =>
                      updateSegment(
                        segment.role,
                        segment.included,
                        Number.parseInt(event.target.value || '0', 10)
                      )
                    }
                  />
                </label>
              ))}
            </div>
            <p className='mt-2 text-right font-mono text-xs tabular-nums text-secondary-token'>
              {recipientCount} exact recipients
            </p>
          </fieldset>

          <div className='mt-4 min-h-12' aria-live='polite'>
            <ApprovalStatus
              approvalIsCurrent={approvalIsCurrent}
              error={error}
              latestApproval={state.latestApproval}
            />
          </div>
          <Button
            className='mt-2 w-full'
            disabled={
              !approvalReady || pending || (approvalIsCurrent && !revising)
            }
            onClick={() =>
              mutate({
                action: 'final_approval',
                draftId: state.draft?.id,
                expectedRenderedCopy: state.composition?.renderedCopy,
                segments,
                recipientCount,
                trackingSettings: {
                  opens: false,
                  clicks: false,
                  privacyDisclosureVersion: null,
                  consentBasis: null,
                },
              })
            }
          >
            Approve Exact Copy And {recipientCount} Recipients
          </Button>
          {approvalIsCurrent && !revising && (
            <Button
              className='mt-2 w-full'
              variant='secondary'
              onClick={() => setRevising(true)}
            >
              Start A New Revision
            </Button>
          )}
          <p
            className={cn(
              'mt-2 text-center text-xs text-secondary-token',
              pending && 'opacity-60'
            )}
          >
            Separate approval is required again after any change or expiry.
          </p>

          {state.deliveryEvents.length > 0 && (
            <div className='mt-4 border-t border-subtle pt-4'>
              <h3 className='text-xs font-semibold uppercase tracking-wide text-secondary-token'>
                Delivery Observations
              </h3>
              <ul className='mt-2 space-y-2 text-xs text-secondary-token'>
                {state.deliveryEvents.map(event => (
                  <li key={event.id}>
                    {event.eventType.replaceAll('_', ' ')} ·{' '}
                    {event.recipientCount} ·{' '}
                    {new Date(event.occurredAt).toLocaleString()} · ref opaque{' '}
                    {event.externalReference}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ContentSurfaceCard>
      </aside>
    </div>
  );
}
