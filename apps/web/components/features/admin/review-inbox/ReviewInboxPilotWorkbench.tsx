'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { AppSegmentControl } from '@/components/atoms/AppSegmentControl';
import type {
  ReviewInboxPilotCase,
  ReviewInboxPin,
  ReviewInboxViewMode,
} from '@/lib/ovie/review-inbox/contract';
import {
  REVIEW_INBOX_DECISION_CONTRACT,
  REVIEW_INBOX_PILOT_TENANT,
} from '@/lib/ovie/review-inbox/contract';
import { FREQUENT_CACHE } from '@/lib/queries/cache-strategies';
import { ReviewInboxComparisonArtboard } from './ReviewInboxComparisonArtboard';
import { ReviewInboxEditorialView } from './ReviewInboxEditorialView';
import { ReviewInboxListView } from './ReviewInboxListView';

const VIEW_LABELS: Record<ReviewInboxViewMode, string> = {
  list: 'List',
  editorial: 'Decision',
  artboard: 'Compare',
};

async function fetchPilot(): Promise<ReviewInboxPilotCase> {
  const response = await fetch('/api/ovie/inbox?pilot=review-photo', {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Pilot case could not load.');
  const json = (await response.json()) as { case: ReviewInboxPilotCase };
  return json.case;
}

async function postDecision(body: Record<string, unknown>) {
  const response = await fetch('/api/ovie/inbox', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof json.message === 'string' ? json.message : 'Decision failed.'
    );
  }
  return json;
}

/**
 * Three-view pilot workbench for one stable InteractionCase item (synthetic).
 */
export function ReviewInboxPilotWorkbench() {
  const [view, setView] = useState<ReviewInboxViewMode>('list');
  const [selectedRevision, setSelectedRevision] = useState('v1');
  const [artboardOpen, setArtboardOpen] = useState(false);
  const [draftPins, setDraftPins] = useState<Omit<ReviewInboxPin, 'author'>[]>(
    []
  );
  const [pinDraftNote, setPinDraftNote] = useState('');
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['ovie', 'review-inbox', 'pilot'],
    queryFn: fetchPilot,
    ...FREQUENT_CACHE,
  });

  const mutation = useMutation({
    mutationFn: postDecision,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['ovie', 'review-inbox', 'pilot'],
      });
      setDraftPins([]);
    },
  });

  const pilotCase = query.data;

  const activeRevision = pilotCase?.activeRevision ?? 'v1';

  const viewOptions = useMemo(
    () =>
      (['list', 'editorial', 'artboard'] as const).map(mode => ({
        value: mode,
        label: VIEW_LABELS[mode],
      })),
    []
  );

  if (query.isPending) {
    return (
      <p className='text-sm text-secondary-token'>Loading review pilot…</p>
    );
  }
  if (query.isError || !pilotCase) {
    return (
      <p className='text-sm text-error' role='alert'>
        {query.error?.message ??
          'Review pilot could not load. Refresh after admin sign-in.'}
      </p>
    );
  }

  async function decide(
    command: 'request_changes' | 'accept_version',
    extra: Record<string, unknown> = {}
  ) {
    if (!pilotCase) return;
    await mutation.mutateAsync({
      contract: REVIEW_INBOX_DECISION_CONTRACT,
      tenant: REVIEW_INBOX_PILOT_TENANT,
      caseId: REVIEW_INBOX_PILOT_TENANT,
      revision: pilotCase.activeRevision,
      command,
      actionId: crypto.randomUUID(),
      ...extra,
    });
  }

  return (
    <section
      className='space-y-4'
      data-testid='review-inbox-pilot-workbench'
      aria-busy={mutation.isPending}
    >
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <h2 className='text-balance text-sm font-semibold'>
          Review Inbox Pilot
        </h2>
        <AppSegmentControl<ReviewInboxViewMode>
          value={view}
          options={viewOptions}
          onValueChange={next => {
            setView(next);
            if (next === 'artboard') setArtboardOpen(true);
          }}
          semantics='radio'
          aria-label='Review Inbox View'
        />
      </div>
      {mutation.isError ? (
        <p className='text-xs text-error' role='alert'>
          {mutation.error.message}
        </p>
      ) : null}
      {view === 'list' ? (
        <ReviewInboxListView
          pilotCase={pilotCase}
          selectedRevision={selectedRevision}
          onSelect={setSelectedRevision}
        />
      ) : null}
      {view === 'editorial' ? (
        <ReviewInboxEditorialView
          pilotCase={pilotCase}
          busy={mutation.isPending}
          onRequestChanges={() =>
            void decide('request_changes', { pins: draftPins })
          }
          onAcceptV2={() =>
            void decide('accept_version', { acceptRevision: 'v2' })
          }
        />
      ) : null}
      {view === 'artboard' ? (
        <p className='text-xs text-secondary-token'>
          Artboard is open. Close it to return focus here.
        </p>
      ) : null}
      <div className='flex flex-wrap gap-2 md:hidden'>
        <button
          type='button'
          className='rounded-lg border border-subtle px-3 py-2 text-sm'
          onClick={() => setArtboardOpen(true)}
        >
          Open compare
        </button>
        <button
          type='button'
          className='rounded-lg border border-subtle px-3 py-2 text-sm'
          disabled={mutation.isPending}
          onClick={() =>
            void decide('accept_version', { acceptRevision: 'v2' })
          }
        >
          Accept v2
        </button>
      </div>
      <ReviewInboxComparisonArtboard
        candidates={pilotCase.candidates}
        activeRevision={activeRevision}
        pins={[
          ...pilotCase.pins,
          ...draftPins.map(p => ({ ...p, author: 'founder' as const })),
        ]}
        open={artboardOpen}
        onClose={() => {
          setArtboardOpen(false);
          if (view === 'artboard') setView('list');
        }}
        draftNote={pinDraftNote}
        onDraftNoteChange={setPinDraftNote}
        onAddPin={pin => setDraftPins(current => [...current, pin])}
      />
    </section>
  );
}
