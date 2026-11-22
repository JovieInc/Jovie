'use client';

import { LoadingSkeleton, Textarea } from '@jovie/ui';
import { useEffect, useState } from 'react';
import { FounderReviewRecorder } from '@/components/features/opportunity-inbox/FounderReviewRecorder';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { DrawerButton } from '@/components/molecules/drawer';
import { EmptyState } from '@/components/molecules/EmptyState';
import { APP_ROUTES } from '@/constants/routes';
import { decisionCardView } from '@/lib/ovie/decision-card-view';
import {
  redactFilesystemPaths,
  summarizeSourceIssues,
} from '@/lib/ovie/home/operator-copy';
import type { OvieInboxCase } from '@/lib/ovie/inbox';
import { CertificationReviewCard } from '../certifications/CertificationReviewCard';
import {
  DecisionCard,
  type DecisionCardStatus,
} from '../decision-card/DecisionCard';
import {
  isSwipeDecision,
  type OvieInboxFailure,
  useOvieInboxDecisions,
} from './useOvieInboxDecisions';

const FOUNDER_NOTE_TARGET = {
  type: 'founder-note',
  id: 'founder-brain-dump',
  title: 'Inbox Brain Dump',
  sourceKind: 'founder.brain_dump',
  category: 'note',
} as const;

/** Opens Ovie chat with a Summer conversation about one inbox decision. */
export function discussDecisionHref(caseId: string): string {
  return `${APP_ROUTES.ADMIN_CHAT}?discuss=${encodeURIComponent(caseId)}`;
}

/** Minute-resolution clock for deadline countdowns. */
function useNowMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function OvieInbox({ caseId }: { readonly caseId?: string }) {
  const [captureOpen, setCaptureOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const now = useNowMinute();
  const { query, submitting, error, receipt, failure, decide, decideNow } =
    useOvieInboxDecisions();
  // A requested case stays bound to the current source response. Never
  // substitute a different actionable card when it disappears or is stale.
  const item =
    caseId === undefined
      ? query.data?.cases[0]
      : query.data?.cases.find(entry => entry.id === caseId);
  const notes = item ? (drafts[item.id] ?? '') : '';
  function setNotes(value: string) {
    if (item) setDrafts(current => ({ ...current, [item.id]: value }));
  }
  async function submitDecision(decision: 'approve' | 'reject' | 'modify') {
    if (!item) return;
    const recorded = await decide(item, decision, notes);
    if (recorded) setDrafts(current => ({ ...current, [item.id]: '' }));
  }

  return (
    <ContentSurfaceCard data-testid='ovie-inbox'>
      <div
        data-testid='ovie-inbox-scrollport'
        className='flex h-64 flex-col overflow-hidden p-4'
      >
        <div className='flex shrink-0 items-center justify-between gap-3'>
          <h2 className='whitespace-nowrap text-sm font-semibold text-primary-token'>
            Inbox
          </h2>
          <DrawerButton
            type='button'
            tone='secondary'
            disabled={submitting || query.isFetching}
            onClick={() => void query.refetch()}
          >
            Refresh
          </DrawerButton>
        </div>
        <div className='mt-3 min-h-0 flex-1 overflow-y-auto'>
          <div className='space-y-3' aria-busy={query.isPending || submitting}>
            {query.isPending ? (
              <div role='status' aria-label='Loading Decisions…'>
                <LoadingSkeleton announce={false} height='h-5' width='w-48' />
                <LoadingSkeleton announce={false} className='mt-2' />
                <LoadingSkeleton
                  announce={false}
                  className='mt-3'
                  width='w-3/4'
                />
                <LoadingSkeleton
                  announce={false}
                  className='mt-3'
                  height='h-8'
                  width='w-24'
                />
              </div>
            ) : query.isError ? (
              <div role='alert'>
                <p>{query.error.message}</p>
                <DrawerButton
                  type='button'
                  tone='secondary'
                  onClick={() => void query.refetch()}
                >
                  Retry
                </DrawerButton>
              </div>
            ) : item && isSwipeDecision(item) ? (
              <div data-testid='ovie-inbox-decision' key={item.id}>
                <DecisionCard
                  view={decisionCardView(item, now)}
                  status={cardStatus(item, failure)}
                  discussHref={discussDecisionHref(item.id)}
                  onApprove={() => void decideNow(item, 'approve')}
                  onReject={() => void decideNow(item, 'reject')}
                  onRetry={
                    failure?.item.id === item.id
                      ? () => void decideNow(item, failure.decision)
                      : undefined
                  }
                />
              </div>
            ) : item ? (
              <article data-testid='ovie-inbox-decision' key={item.id}>
                {item.certification ? (
                  <CertificationReviewCard {...item.certification} />
                ) : (
                  <>
                    <h3 className='text-balance text-app font-medium text-primary-token'>
                      {item.title}
                    </h3>
                    <p className='mt-2 whitespace-pre-wrap text-app text-secondary-token'>
                      {item.body}
                    </p>
                    <p className='mt-3 text-app text-secondary-token'>
                      {item.recommendation}
                    </p>
                  </>
                )}
                {item.certification ? null : (
                  <ul className='mt-3 space-y-1'>
                    {item.evidence
                      .filter(
                        ref =>
                          /^https?:\/\//u.test(ref) ||
                          ref.startsWith('/api/admin/hud/visual-qa/')
                      )
                      .map(ref => (
                        <li key={ref}>
                          <a
                            className='break-all text-xs underline'
                            href={ref}
                            target='_blank'
                            rel='noopener noreferrer'
                          >
                            View evidence: {ref}
                          </a>
                        </li>
                      ))}
                  </ul>
                )}
                {item.decisionTarget ? (
                  <div className='mt-4 space-y-3'>
                    <label
                      htmlFor='ovie-inbox-decision-notes'
                      hidden={item.decisionTarget.kind === 'linear'}
                      className='block text-xs text-secondary-token'
                    >
                      Decision notes
                      <Textarea
                        id='ovie-inbox-decision-notes'
                        textareaSize='sm'
                        className='mt-1'
                        value={notes}
                        onChange={event => setNotes(event.target.value)}
                        rows={3}
                        maxLength={2000}
                        disabled={submitting}
                      />
                    </label>
                    <div className='flex flex-wrap gap-2'>
                      <DrawerButton
                        type='button'
                        tone='primary'
                        disabled={submitting || query.isFetching}
                        onClick={() => void submitDecision('approve')}
                      >
                        {item.decisionTarget.kind === 'linear'
                          ? 'Mark done'
                          : item.decisionTarget.kind === 'certification'
                            ? 'Certify'
                            : 'Approve'}
                      </DrawerButton>
                      <DrawerButton
                        type='button'
                        tone='secondary'
                        disabled={submitting || query.isFetching}
                        onClick={() => void submitDecision('reject')}
                        hidden={item.decisionTarget.kind === 'linear'}
                      >
                        Reject
                      </DrawerButton>
                      {item.decisionTarget.kind === 'certification' ? (
                        <DrawerButton
                          type='button'
                          tone='secondary'
                          disabled={submitting || query.isFetching}
                          onClick={() => void submitDecision('modify')}
                        >
                          Request changes
                        </DrawerButton>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className='mt-3 text-xs text-secondary-token'>
                    More evidence is required before this decision can be
                    recorded.
                  </p>
                )}
              </article>
            ) : caseId !== undefined ? (
              <EmptyState
                presentation='quiet'
                heading='This decision is not in the current inbox. Refresh to check its status.'
                action={{
                  label: 'Refresh',
                  onClick: () => void query.refetch(),
                }}
              />
            ) : (
              <EmptyState
                presentation='quiet'
                heading={
                  query.data?.issues.length
                    ? 'No pending decisions in connected sources.'
                    : 'No pending founder decisions.'
                }
              />
            )}
            {receipt ? (
              <p
                role='status'
                className='truncate text-xs text-tertiary-token'
                data-testid='ovie-inbox-receipt'
              >
                <span className='text-secondary-token'>
                  {receipt.decision === 'approve' ? 'Approved' : 'Rejected'}
                </span>{' '}
                {receipt.item.title}
              </p>
            ) : null}
            {error ? (
              <p role='alert' className='text-xs text-error'>
                {error}
              </p>
            ) : null}
            {query.data?.issues.length ? (
              <SourceIssues issues={query.data.issues} />
            ) : null}
          </div>
          <details
            className='mt-4 border-t border-subtle pt-3'
            onToggle={event => setCaptureOpen(event.currentTarget.open)}
          >
            <summary className='cursor-pointer text-xs text-secondary-token'>
              Capture A Note
            </summary>
            <div className='mt-3'>
              {captureOpen ? (
                <FounderReviewRecorder target={FOUNDER_NOTE_TARGET} />
              ) : null}
            </div>
          </details>
        </div>
      </div>
    </ContentSurfaceCard>
  );
}

function cardStatus(
  item: OvieInboxCase,
  failure: OvieInboxFailure | null
): DecisionCardStatus {
  return failure?.item.id === item.id
    ? { kind: 'error', message: failure.message }
    : { kind: 'pending' };
}

/**
 * One line for the warning; several issues (one per uncertified component,
 * say) stay behind a disclosure instead of inlining every name.
 */
function SourceIssues({
  issues,
}: Readonly<{ readonly issues: readonly string[] }>) {
  const visibleIssues = [
    ...new Set(
      issues.map(issue => redactFilesystemPaths(issue.trim())).filter(Boolean)
    ),
  ];
  const summary = summarizeSourceIssues(visibleIssues);
  if (!summary) return null;
  if (visibleIssues.length <= 1)
    return (
      <p role='status' className='text-xs text-secondary-token'>
        {summary}
      </p>
    );
  return (
    <details
      role='status'
      className='text-xs text-secondary-token'
      data-testid='ovie-inbox-source-issues'
    >
      <summary className='cursor-pointer'>{summary}</summary>
      <ul className='mt-1 flex flex-col gap-0.5 pl-3 text-tertiary-token'>
        {visibleIssues.map(issue => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
    </details>
  );
}
