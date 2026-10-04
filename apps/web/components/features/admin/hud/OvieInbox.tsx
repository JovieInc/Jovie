'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { DrawerButton } from '@/components/molecules/drawer';
import {
  type OvieInbox as Inbox,
  inboxDecisionRequest,
} from '@/lib/ovie/inbox';
import { FREQUENT_CACHE } from '@/lib/queries/cache-strategies';

export function OvieInbox() {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const query = useQuery<Inbox>({
    queryKey: ['ovie', 'inbox'],
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/ovie/inbox', {
        signal,
        cache: 'no-store',
      });
      if (!response.ok)
        throw new Error(
          'Inbox could not load. Retry to check pending decisions.'
        );
      return response.json();
    },
    ...FREQUENT_CACHE,
    refetchOnWindowFocus: true,
    refetchInterval: submitting ? false : 30_000,
  });
  const item = query.data?.cases[0];
  const notes = item ? (drafts[item.id] ?? '') : '';
  function setNotes(value: string) {
    if (item) setDrafts(current => ({ ...current, [item.id]: value }));
  }

  async function decide(decision: 'approve' | 'reject' | 'modify') {
    if (!item?.decisionTarget || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const request = inboxDecisionRequest(
        item.decisionTarget,
        decision,
        notes,
        crypto.randomUUID()
      );
      const response = await fetch(request.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request.body),
      });
      if (!response.ok) {
        if (response.status === 409) await query.refetch();
        throw new Error(
          response.status === 409
            ? 'This decision changed. Review the latest evidence and retry.'
            : 'Decision was not recorded. Your notes are preserved; retry.'
        );
      }
      setDrafts(current => ({ ...current, [item.id]: '' }));
      queryClient.setQueryData<Inbox>(['ovie', 'inbox'], current =>
        current
          ? {
              ...current,
              cases: current.cases.filter(entry => entry.id !== item.id),
            }
          : current
      );
      await query.refetch();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Decision could not be recorded.'
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <ContentSurfaceCard data-testid='ovie-inbox'>
      <div className='min-h-64 p-4'>
        <div className='flex items-center justify-between gap-3'>
          <h2 className='text-sm font-semibold text-primary-token'>Inbox</h2>
          <DrawerButton
            type='button'
            tone='secondary'
            disabled={submitting || query.isFetching}
            onClick={() => void query.refetch()}
          >
            Refresh
          </DrawerButton>
        </div>
        <div
          className='mt-3 space-y-3'
          aria-busy={query.isPending || submitting}
        >
          {query.isPending ? (
            <p role='status'>Loading decisions…</p>
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
          ) : item ? (
            <article data-testid='ovie-inbox-decision' key={item.id}>
              <h3 className='text-app font-medium text-primary-token'>
                {item.title}
              </h3>
              <p className='mt-2 whitespace-pre-wrap text-app text-secondary-token'>
                {item.body}
              </p>
              <p className='mt-3 text-app text-secondary-token'>
                {item.recommendation}
              </p>
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
              {item.decisionTarget ? (
                <div className='mt-4 space-y-3'>
                  <label
                    hidden={item.decisionTarget.kind === 'linear'}
                    className='block text-xs text-secondary-token'
                  >
                    Decision notes
                    <textarea
                      className='mt-1 block w-full rounded-lg border border-subtle bg-surface-0 p-2 text-app text-primary-token'
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
                      onClick={() => void decide('approve')}
                    >
                      {item.decisionTarget.kind === 'linear'
                        ? 'Mark done'
                        : 'Approve'}
                    </DrawerButton>
                    <DrawerButton
                      type='button'
                      tone='secondary'
                      disabled={submitting || query.isFetching}
                      onClick={() => void decide('reject')}
                      hidden={item.decisionTarget.kind === 'linear'}
                    >
                      Reject
                    </DrawerButton>
                    {item.decisionTarget.kind === 'certification' ? (
                      <DrawerButton
                        type='button'
                        tone='secondary'
                        disabled={submitting || query.isFetching}
                        onClick={() => void decide('modify')}
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
          ) : (
            <p role='status'>
              {query.data?.issues.length
                ? 'No pending decisions in connected sources.'
                : 'No pending founder decisions.'}
            </p>
          )}
          {error ? (
            <p role='alert' className='text-xs text-error'>
              {error}
            </p>
          ) : null}
          {query.data?.issues.length ? (
            <p role='status' className='text-xs text-secondary-token'>
              Some sources are unavailable. {query.data.issues.join(' ')}
            </p>
          ) : null}
        </div>
      </div>
    </ContentSurfaceCard>
  );
}
