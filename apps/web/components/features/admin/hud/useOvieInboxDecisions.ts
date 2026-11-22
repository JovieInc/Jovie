'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  type OvieInbox as Inbox,
  inboxDecisionRequest,
  type OvieInboxCase,
} from '@/lib/ovie/inbox';
import { FREQUENT_CACHE } from '@/lib/queries/cache-strategies';

export const OVIE_INBOX_QUERY_KEY = ['ovie', 'inbox'] as const;

export interface OvieInboxReceipt {
  readonly item: OvieInboxCase;
  readonly decision: 'approve' | 'reject';
}

export interface OvieInboxFailure extends OvieInboxReceipt {
  readonly message: string;
}

/**
 * One implementation of the Ovie inbox read and decide path, shared by the
 * Inbox panel and the composer dock so both ride the same ['ovie','inbox']
 * query cache. Swipe-binary cards advance optimistically (`decideNow`): the
 * next card shows at once, the last decision stays as a receipt, and a failed
 * write restores the card with Retry. A 409 means the decision was already
 * recorded elsewhere and the refetched inbox is the truth.
 */
export function useOvieInboxDecisions({
  pollMs = 30_000,
}: {
  readonly pollMs?: number;
} = {}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [receipt, setReceipt] = useState<OvieInboxReceipt | null>(null);
  const [failure, setFailure] = useState<OvieInboxFailure | null>(null);
  const query = useQuery<Inbox>({
    queryKey: OVIE_INBOX_QUERY_KEY,
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
    refetchInterval: submitting ? false : pollMs,
  });

  /** Form decision (notes, modify): waits for the server, then refetches. */
  async function decide(
    item: OvieInboxCase,
    decision: 'approve' | 'reject' | 'modify',
    notes: string
  ): Promise<boolean> {
    if (!item.decisionTarget || submittingRef.current) return false;
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
      queryClient.setQueryData<Inbox>(OVIE_INBOX_QUERY_KEY, current =>
        current
          ? {
              ...current,
              cases: current.cases.filter(entry => entry.id !== item.id),
            }
          : current
      );
      await query.refetch();
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Decision could not be recorded.'
      );
      return false;
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function removeCase(id: string) {
    queryClient.setQueryData<Inbox>(OVIE_INBOX_QUERY_KEY, current =>
      current
        ? { ...current, cases: current.cases.filter(entry => entry.id !== id) }
        : current
    );
  }

  function restoreCase(target: OvieInboxCase) {
    queryClient.setQueryData<Inbox>(OVIE_INBOX_QUERY_KEY, current =>
      current && !current.cases.some(entry => entry.id === target.id)
        ? { ...current, cases: [target, ...current.cases] }
        : current
    );
  }

  /** Optimistic: the next card shows at once; a failure restores this one. */
  async function decideNow(
    target: OvieInboxCase,
    decision: 'approve' | 'reject'
  ) {
    if (!target.decisionTarget || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    setFailure(null);
    setReceipt({ item: target, decision });
    removeCase(target.id);
    try {
      const request = inboxDecisionRequest(
        target.decisionTarget,
        decision,
        '',
        crypto.randomUUID()
      );
      const response = await fetch(request.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request.body),
      });
      if (response.status === 409) {
        // Already decided elsewhere: the refreshed inbox is the truth.
        setReceipt(null);
        setError('This decision was already recorded. The inbox is current.');
        return;
      }
      if (!response.ok) throw new Error('Not recorded.');
    } catch {
      setReceipt(null);
      restoreCase(target);
      setFailure({ item: target, decision, message: 'Not recorded. Retry.' });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      void query.refetch();
    }
  }

  return {
    query,
    submitting,
    error,
    receipt,
    failure,
    decide,
    decideNow,
  };
}

/**
 * Summer cards, design proposals and visual changes are binary: Approve or
 * Reject, with Discuss for anything else. Linear asks (typed answers) and
 * certifications (evidence notes) keep their own forms.
 */
export function isSwipeDecision(item: OvieInboxCase): boolean {
  const kind = item.decisionTarget?.kind;
  return (
    !item.certification &&
    (kind === 'summer' || kind === 'design' || kind === 'visual')
  );
}
