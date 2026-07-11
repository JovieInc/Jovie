'use client';

import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Loader2,
  Monitor,
  RotateCcw,
  Smartphone,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/components/feedback';
import { DrawerButton } from '@/components/molecules/drawer';
import {
  DESIGN_PROPOSAL_STATUSES,
  type DesignProposal,
  type DesignProposalKind,
  type DesignProposalStatus,
} from '@/lib/agent-os/design-lab/types';
import { cn } from '@/lib/utils';

const FETCH_URL = '/api/admin/design-lab/proposals';
const CONTROL_CLASS =
  'h-8 rounded-md border border-subtle bg-surface-0 px-2 text-xs text-primary-token outline-none focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/20';
const FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30';

interface DesignProposalsResponse {
  readonly proposals: readonly DesignProposal[];
}

type Viewport = 'desktop' | 'mobile';

function StatusChip({ status }: { readonly status: DesignProposalStatus }) {
  const tone = {
    proposed: 'border-default text-secondary-token',
    reviewing: 'border-warning/40 text-warning',
    approved: 'border-success/40 text-success',
    rejected: 'border-destructive/40 text-destructive',
    implemented: 'border-accent/40 text-accent',
  }[status];
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2 py-0.5 text-2xs font-medium',
        tone
      )}
    >
      {status[0]?.toUpperCase()}
      {status.slice(1)}
    </span>
  );
}

function Wireframe({
  proposal,
  viewport,
}: {
  readonly proposal: DesignProposal;
  readonly viewport: Viewport;
}) {
  const wireframe = proposal.designGap?.wireframes?.[viewport];
  if (!wireframe) {
    return (
      <div className='flex min-h-96 items-center justify-center border border-dashed border-default bg-surface-0 text-xs text-tertiary-token'>
        No {viewport} wireframe is committed for this review ID.
      </div>
    );
  }

  return (
    <div
      className='flex min-h-96 items-center justify-center overflow-auto bg-surface-0 p-4'
      data-testid={`design-lab-wireframe-${viewport}`}
    >
      <div
        className={cn(
          'w-full border border-default bg-surface-1 p-4 shadow-card transition-[max-width] duration-subtle',
          viewport === 'mobile' ? 'max-w-sm' : 'max-w-5xl'
        )}
      >
        <div className='mb-4 flex items-center justify-between border-b border-subtle pb-3'>
          <span className='text-xs font-medium text-primary-token'>
            {wireframe.width}px grayscale specification
          </span>
          <span className='text-2xs text-tertiary-token'>
            {wireframe.contentDensity} density
          </span>
        </div>
        <div
          className={cn(
            'grid min-h-72 gap-3',
            viewport === 'desktop' ? 'grid-cols-12' : 'grid-cols-1'
          )}
        >
          {wireframe.hierarchy.map((item, index) => (
            <div
              key={item}
              className={cn(
                'flex min-h-12 items-center justify-center border border-default bg-surface-2 px-3 text-center text-xs text-secondary-token',
                viewport === 'desktop' &&
                  (index === 0 || index === wireframe.hierarchy.length - 1
                    ? 'col-span-12'
                    : index % 2 === 0
                      ? 'col-span-7'
                      : 'col-span-5'),
                /media|video|proof|card|preview/i.test(item) && 'min-h-32'
              )}
            >
              {item}
            </div>
          ))}
        </div>
        <dl className='mt-4 grid gap-2 border-t border-subtle pt-3 text-2xs sm:grid-cols-2'>
          <div>
            <dt className='text-tertiary-token'>Layout</dt>
            <dd className='text-secondary-token'>{wireframe.layout}</dd>
          </div>
          <div>
            <dt className='text-tertiary-token'>Media</dt>
            <dd className='text-secondary-token'>{wireframe.mediaPlacement}</dd>
          </div>
          <div>
            <dt className='text-tertiary-token'>Responsive</dt>
            <dd className='text-secondary-token'>
              {wireframe.responsiveBehavior}
            </dd>
          </div>
          <div>
            <dt className='text-tertiary-token'>Interaction</dt>
            <dd className='text-secondary-token'>
              {wireframe.interactionModel}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function DetailList({
  label,
  items,
}: {
  readonly label: string;
  readonly items: readonly string[];
}) {
  return (
    <div className='space-y-1'>
      <h3 className='text-xs font-medium text-primary-token'>{label}</h3>
      {items.length > 0 ? (
        <ul className='list-disc space-y-1 pl-4 text-xs text-secondary-token'>
          {items.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className='text-xs text-tertiary-token'>None recorded.</p>
      )}
    </div>
  );
}

export function DesignProposalReviewPanel({
  kind,
}: {
  readonly kind?: DesignProposalKind;
} = {}) {
  const [proposals, setProposals] = useState<readonly DesignProposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [sectionType, setSectionType] = useState('');
  const [affectedRoute, setAffectedRoute] = useState('');
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [notes, setNotes] = useState('');
  const [feedback, setFeedback] = useState('');
  const [evidence, setEvidence] = useState('');
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [commentMessage, setCommentMessage] = useState<string | null>(null);
  const [hasLoadedCatalog, setHasLoadedCatalog] = useState(false);

  const loadProposals = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    const query = new URLSearchParams();
    if (kind) query.set('kind', kind);
    if (status) query.set('status', status);
    if (sectionType) query.set('sectionType', sectionType);
    if (affectedRoute) query.set('affectedRoute', affectedRoute);
    try {
      const response = await fetch(`${FETCH_URL}?${query}`, {
        cache: 'no-store',
      });
      const payload = (await response.json()) as DesignProposalsResponse & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error ?? 'Gallery unavailable.');
      setProposals(payload.proposals);
      setSelectedId(current =>
        payload.proposals.some(item => item.id === current)
          ? current
          : (payload.proposals[0]?.id ?? null)
      );
      setHasLoadedCatalog(true);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'Gallery unavailable.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [affectedRoute, kind, sectionType, status]);

  useEffect(() => {
    void loadProposals();
  }, [loadProposals]);

  const selectedIndex = Math.max(
    0,
    proposals.findIndex(item => item.id === selectedId)
  );
  const selected = proposals[selectedIndex] ?? null;
  const sectionTypes = useMemo(
    () =>
      [
        ...new Set(
          proposals.flatMap(item => item.designGap?.sectionType ?? [])
        ),
      ].sort(),
    [proposals]
  );
  const routes = useMemo(
    () =>
      [
        ...new Set(
          proposals.flatMap(item => item.designGap?.affectedRoutes ?? [])
        ),
      ].sort(),
    [proposals]
  );

  const replaceProposal = useCallback((updated: DesignProposal) => {
    setProposals(current =>
      current.map(item => (item.id === updated.id ? updated : item))
    );
  }, []);

  const submit = useCallback(
    async (path: string, body: object, operation: string) => {
      if (!selected) return;
      setSubmitting(operation);
      try {
        const response = await fetch(
          `/api/admin/design-lab/proposals/${encodeURIComponent(selected.id)}/${path}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        );
        const payload = (await response.json()) as {
          error?: string;
          proposal?: DesignProposal;
          result?: { proposal?: DesignProposal; dispatchTriggered?: boolean };
        };
        if (!response.ok) {
          if (response.status === 409)
            setCommentMessage('Review conflict. Reload before retrying.');
          throw new Error(payload.error ?? `${operation} failed.`);
        }
        const updated = payload.proposal ?? payload.result?.proposal;
        if (updated) replaceProposal(updated);
        setNotes('');
        setEvidence('');
        toast.success(
          payload.result?.dispatchTriggered
            ? 'Approved and implementation dispatch recorded.'
            : `${operation} saved.`
        );
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : `${operation} failed.`
        );
      } finally {
        setSubmitting(null);
      }
    },
    [replaceProposal, selected]
  );

  const submitReview = (decision: 'yes' | 'no' | 'yes-with-notes') => {
    if (!selected?.dayBucket) return;
    if (decision !== 'yes' && !notes.trim()) {
      toast.error('Notes are required for this decision.');
      return;
    }
    void submit(
      'review',
      { dayBucket: selected.dayBucket, decision, notes: notes.trim() || null },
      'Review'
    );
  };

  const submitComment = async () => {
    if (!selected?.dayBucket) return;
    setCommentMessage(null);
    setSubmitting('Comment');
    try {
      const response = await fetch(
        `/api/admin/design-lab/proposals/${encodeURIComponent(selected.id)}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dayBucket: selected.dayBucket,
            compactFeedback: feedback,
          }),
        }
      );
      const payload = (await response.json()) as {
        error?: string;
        proposal?: DesignProposal;
      };
      if (!response.ok || !payload.proposal) {
        throw new Error(payload.error ?? 'Comment failed.');
      }
      replaceProposal(payload.proposal);
      setFeedback('');
      setCommentMessage('Comment appended to the review history.');
    } catch (error) {
      setCommentMessage(
        error instanceof Error ? error.message : 'Comment failed.'
      );
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div
      className='min-h-screen space-y-4'
      data-testid='design-proposal-review-panel'
    >
      <div className='flex min-h-10 flex-wrap items-end gap-3'>
        <label className='grid gap-1 text-2xs text-tertiary-token'>
          Status
          <select
            className={CONTROL_CLASS}
            value={status}
            onChange={event => setStatus(event.target.value)}
          >
            <option value=''>All Statuses</option>
            {DESIGN_PROPOSAL_STATUSES.map(item => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className='grid gap-1 text-2xs text-tertiary-token'>
          Section Type
          <select
            className={CONTROL_CLASS}
            value={sectionType}
            onChange={event => setSectionType(event.target.value)}
          >
            <option value=''>All Section Types</option>
            {sectionTypes.map(item => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className='grid gap-1 text-2xs text-tertiary-token'>
          Affected Route
          <select
            className={CONTROL_CLASS}
            value={affectedRoute}
            onChange={event => setAffectedRoute(event.target.value)}
          >
            <option value=''>All Routes</option>
            {routes.map(item => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>

      <div className='min-h-96 rounded-lg border border-subtle bg-surface-1 shadow-card'>
        {isLoading ? (
          <div className='flex min-h-96 items-center justify-center gap-2 text-xs text-secondary-token'>
            <Loader2 className='size-4 animate-spin' aria-hidden='true' />
            Loading proposed sections…
          </div>
        ) : loadError ? (
          <div className='flex min-h-96 flex-col items-center justify-center gap-3 text-xs text-secondary-token'>
            <p role='alert'>{loadError}</p>
            <DrawerButton
              type='button'
              tone='secondary'
              onClick={() => void loadProposals()}
            >
              <RotateCcw aria-hidden='true' /> Retry
            </DrawerButton>
          </div>
        ) : proposals.length === 0 ? (
          <div className='flex min-h-96 items-center justify-center text-xs text-secondary-token'>
            {hasLoadedCatalog && (status || sectionType || affectedRoute)
              ? 'No proposed sections match these filters.'
              : 'No proposed sections are committed.'}
          </div>
        ) : selected ? (
          <div className='grid min-h-96 lg:grid-cols-12'>
            <aside className='border-b border-subtle p-3 lg:col-span-3 lg:border-b-0 lg:border-r'>
              <div className='mb-3 flex items-center justify-between'>
                <span className='text-xs text-tertiary-token'>
                  {selectedIndex + 1} of {proposals.length}
                </span>
                <div className='flex gap-1'>
                  <button
                    type='button'
                    aria-label='Previous Proposal'
                    disabled={selectedIndex === 0}
                    className={cn(
                      'rounded-md p-1 text-secondary-token disabled:opacity-30',
                      FOCUS_CLASS
                    )}
                    onClick={() =>
                      setSelectedId(proposals[selectedIndex - 1]?.id ?? null)
                    }
                  >
                    <ArrowLeft className='size-4' />
                  </button>
                  <button
                    type='button'
                    aria-label='Next Proposal'
                    disabled={selectedIndex === proposals.length - 1}
                    className={cn(
                      'rounded-md p-1 text-secondary-token disabled:opacity-30',
                      FOCUS_CLASS
                    )}
                    onClick={() =>
                      setSelectedId(proposals[selectedIndex + 1]?.id ?? null)
                    }
                  >
                    <ArrowRight className='size-4' />
                  </button>
                </div>
              </div>
              <nav aria-label='Proposed Sections' className='grid gap-1'>
                {proposals.map(item => (
                  <button
                    key={item.id}
                    type='button'
                    className={cn(
                      'rounded-md px-2 py-2 text-left text-xs text-secondary-token hover:bg-surface-0',
                      item.id === selected.id &&
                        'bg-surface-0 text-primary-token',
                      FOCUS_CLASS
                    )}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span className='block font-medium'>
                      {item.designGap?.reviewId ?? item.id}
                    </span>
                    <span className='block truncate text-tertiary-token'>
                      {item.surfaceName}
                    </span>
                  </button>
                ))}
              </nav>
            </aside>

            <section className='min-w-0 space-y-4 p-4 lg:col-span-9'>
              <header className='flex flex-wrap items-start justify-between gap-3'>
                <div className='min-w-0'>
                  <p className='font-mono text-xs text-tertiary-token'>
                    {selected.designGap?.reviewId ?? selected.id}
                  </p>
                  <h2 className='text-base font-semibold text-primary-token'>
                    {selected.surfaceName}
                  </h2>
                  <p className='mt-1 max-w-3xl text-xs leading-5 text-secondary-token'>
                    {selected.designGap?.problem ?? selected.proposalText}
                  </p>
                </div>
                <StatusChip status={selected.status} />
              </header>

              <div className='flex flex-wrap items-center justify-between gap-2 border-y border-subtle py-2'>
                <div className='flex flex-wrap gap-2'>
                  {selected.designGap?.affectedRoutes.map(route => (
                    <a
                      key={route}
                      href={route}
                      target='_blank'
                      rel='noreferrer'
                      className={cn(
                        'inline-flex items-center gap-1 text-xs text-accent hover:underline',
                        FOCUS_CLASS
                      )}
                    >
                      {route}
                      <ExternalLink className='size-3' />
                    </a>
                  ))}
                </div>
                <div
                  className='flex rounded-md border border-subtle bg-surface-0 p-0.5'
                  role='tablist'
                  aria-label='Wireframe Viewport'
                >
                  {(['desktop', 'mobile'] as const).map(item => (
                    <button
                      key={item}
                      type='button'
                      role='tab'
                      aria-selected={viewport === item}
                      className={cn(
                        'inline-flex h-7 items-center gap-1 rounded px-2 text-2xs text-secondary-token',
                        viewport === item &&
                          'bg-surface-1 text-primary-token shadow-card',
                        FOCUS_CLASS
                      )}
                      onClick={() => setViewport(item)}
                    >
                      {item === 'desktop' ? (
                        <Monitor className='size-3' />
                      ) : (
                        <Smartphone className='size-3' />
                      )}
                      {item === 'desktop' ? 'Desktop' : 'Mobile'}
                    </button>
                  ))}
                </div>
              </div>

              <Wireframe proposal={selected} viewport={viewport} />

              {selected.designGap ? (
                <div className='grid gap-4 border-t border-subtle pt-4 md:grid-cols-2'>
                  <DetailList
                    label='Required Content'
                    items={selected.designGap.requiredContentFields}
                  />
                  <DetailList
                    label='Required Media'
                    items={selected.designGap.requiredMedia}
                  />
                  <DetailList
                    label='Open Questions'
                    items={selected.designGap.openQuestions}
                  />
                  <div className='space-y-2 text-xs'>
                    <h3 className='font-medium text-primary-token'>
                      Registry Conversion
                    </h3>
                    {selected.designGap.registryTask ? (
                      <>
                        <p className='text-secondary-token'>
                          Target:{' '}
                          {selected.designGap.registryTask.targetSectionId}
                        </p>
                        <DetailList
                          label='Acceptance Criteria'
                          items={
                            selected.designGap.registryTask.acceptanceCriteria
                          }
                        />
                        <p className='text-tertiary-token'>
                          Dispatch:{' '}
                          {selected.dispatchId ??
                            'Not dispatched. Approval is required.'}
                        </p>
                        <p className='text-tertiary-token'>
                          Evidence:{' '}
                          {selected.designGap.registryTask.evidenceRefs.join(
                            ', '
                          ) || 'No implementation evidence recorded.'}
                        </p>
                      </>
                    ) : (
                      <p className='text-tertiary-token'>
                        No registry task is committed.
                      </p>
                    )}
                  </div>
                  <div className='space-y-2 md:col-span-2'>
                    <h3 className='text-xs font-medium text-primary-token'>
                      Model Usage
                    </h3>
                    {selected.designGap.modelUsage.map(usage => (
                      <p
                        key={`${usage.role}:${usage.model}`}
                        className='text-xs text-secondary-token'
                      >
                        {usage.role}: {usage.model} · {String(usage.tokens)}{' '}
                        tokens · ${String(usage.estimatedCostUsd)} —{' '}
                        {usage.estimationBasis}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className='grid gap-4 border-t border-subtle pt-4 md:grid-cols-2'>
                <div className='min-h-40 space-y-2'>
                  <h3 className='text-xs font-medium text-primary-token'>
                    Comment History
                  </h3>
                  <div
                    className='max-h-40 space-y-2 overflow-auto'
                    aria-live='polite'
                  >
                    {selected.designGap?.comments.map(comment => (
                      <div
                        key={`${comment.date}:${comment.author}:${comment.body}`}
                        className='border-l border-default pl-2 text-xs'
                      >
                        <p className='text-tertiary-token'>
                          {comment.author} · {comment.date}
                        </p>
                        <p className='text-secondary-token'>{comment.body}</p>
                      </div>
                    ))}
                  </div>
                  <label className='grid gap-1 text-2xs text-tertiary-token'>
                    Compact Feedback
                    <input
                      className={cn(CONTROL_CLASS, 'w-full')}
                      value={feedback}
                      onChange={event => setFeedback(event.target.value)}
                      placeholder={`${selected.designGap?.reviewId ?? selected.id}: …`}
                    />
                  </label>
                  <div className='flex min-h-7 items-center justify-between gap-2'>
                    <span
                      className={cn(
                        'text-2xs',
                        commentMessage?.includes('appended')
                          ? 'text-success'
                          : 'text-destructive'
                      )}
                      role='status'
                    >
                      {commentMessage}
                    </span>
                    <DrawerButton
                      type='button'
                      tone='secondary'
                      disabled={submitting !== null || !feedback.trim()}
                      onClick={() => void submitComment()}
                    >
                      Add Comment
                    </DrawerButton>
                  </div>
                </div>

                <div className='min-h-40 space-y-2'>
                  <label className='grid gap-1 text-2xs text-tertiary-token'>
                    Review Notes
                    <textarea
                      className={cn(CONTROL_CLASS, 'h-20 resize-none py-2')}
                      value={notes}
                      onChange={event => setNotes(event.target.value)}
                      placeholder='Required for rejection and approval with notes'
                    />
                  </label>
                  <div className='flex flex-wrap gap-2'>
                    <DrawerButton
                      type='button'
                      tone='primary'
                      disabled={
                        submitting !== null ||
                        !['proposed', 'reviewing'].includes(selected.status)
                      }
                      onClick={() => submitReview('yes')}
                    >
                      Approve
                    </DrawerButton>
                    <DrawerButton
                      type='button'
                      tone='secondary'
                      disabled={
                        submitting !== null ||
                        !['proposed', 'reviewing'].includes(selected.status)
                      }
                      onClick={() => submitReview('yes-with-notes')}
                    >
                      Approve With Notes
                    </DrawerButton>
                    <DrawerButton
                      type='button'
                      tone='secondary'
                      className='text-destructive'
                      disabled={
                        submitting !== null ||
                        !['proposed', 'reviewing'].includes(selected.status)
                      }
                      onClick={() => submitReview('no')}
                    >
                      Reject
                    </DrawerButton>
                  </div>
                  {selected.status === 'approved' ? (
                    <div className='flex gap-2 pt-2'>
                      <input
                        className={cn(CONTROL_CLASS, 'min-w-0 flex-1')}
                        value={evidence}
                        onChange={event => setEvidence(event.target.value)}
                        placeholder='Evidence refs, comma-separated'
                      />
                      <DrawerButton
                        type='button'
                        tone='secondary'
                        disabled={submitting !== null || !evidence.trim()}
                        onClick={() =>
                          void submit(
                            'implemented',
                            {
                              dayBucket: selected.dayBucket,
                              evidenceRefs: evidence
                                .split(',')
                                .map(item => item.trim())
                                .filter(Boolean),
                            },
                            'Implementation Evidence'
                          )
                        }
                      >
                        Mark Implemented
                      </DrawerButton>
                    </div>
                  ) : null}
                  <div
                    className='min-h-5 text-2xs text-tertiary-token'
                    aria-live='polite'
                  >
                    {submitting
                      ? `${submitting} submitting…`
                      : selected.reviewNotes
                        ? `Last review: ${selected.reviewNotes}`
                        : null}
                  </div>
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
