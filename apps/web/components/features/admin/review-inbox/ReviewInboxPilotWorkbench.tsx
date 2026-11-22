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
import { isMarkStale } from '@/lib/ovie/review-inbox/marks';
import { FREQUENT_CACHE } from '@/lib/queries/cache-strategies';
import { cn } from '@/lib/utils';
import { ReviewCanvas, type ReviewCanvasDraft } from './ReviewCanvas';
import { ReviewInboxComparisonArtboard } from './ReviewInboxComparisonArtboard';
import { ReviewInboxEditorialView } from './ReviewInboxEditorialView';
import { ReviewInboxListView } from './ReviewInboxListView';

const VIEW_LABELS: Record<ReviewInboxViewMode, string> = {
  canvas: 'Annotate',
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
  const [view, setView] = useState<ReviewInboxViewMode>('canvas');
  // null follows the active revision until the reviewer picks another one.
  const [pickedRevision, setPickedRevision] = useState<string | null>(null);
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
  const selectedRevision = pickedRevision ?? activeRevision;

  const viewOptions = useMemo(
    () =>
      (['canvas', 'list', 'editorial', 'artboard'] as const).map(mode => ({
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
    // The review route is the only writer; marks travel with their revision.
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
      {view === 'canvas' ? (
        <ReviewInboxCanvasView
          pilotCase={pilotCase}
          selectedRevision={selectedRevision}
          onSelectRevision={setPickedRevision}
          busy={mutation.isPending}
          onRequestChanges={async draft => {
            await decide('request_changes', {
              pins: draft.pins,
              strokes: draft.strokes,
              ...(draft.comment ? { notes: draft.comment } : {}),
            });
            setPickedRevision(null);
          }}
          onAcceptV2={() =>
            void decide('accept_version', { acceptRevision: 'v2' })
          }
        />
      ) : null}
      {view === 'list' ? (
        <ReviewInboxListView
          pilotCase={pilotCase}
          selectedRevision={selectedRevision}
          onSelect={setPickedRevision}
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

function ReviewInboxCanvasView({
  pilotCase,
  selectedRevision,
  onSelectRevision,
  busy,
  onRequestChanges,
  onAcceptV2,
}: Readonly<{
  pilotCase: ReviewInboxPilotCase;
  selectedRevision: string;
  onSelectRevision: (revision: string) => void;
  busy: boolean;
  onRequestChanges: (draft: ReviewCanvasDraft) => Promise<void>;
  onAcceptV2: () => void;
}>) {
  const asset =
    pilotCase.candidates.find(c => c.revision === selectedRevision) ??
    pilotCase.candidates[0];
  if (!asset) return null;
  const stale = isMarkStale({ revision: asset.revision }, pilotCase);
  const canRequest =
    pilotCase.lifecycle === 'awaiting_review' &&
    asset.revision === pilotCase.activeRevision;
  const comments = pilotCase.comments.filter(
    comment => comment.revision === asset.revision
  );

  return (
    <div className='space-y-3' data-testid='review-inbox-canvas-view'>
      <div className='flex flex-wrap gap-1'>
        {pilotCase.candidates.map(candidate => (
          <button
            key={candidate.revision}
            type='button'
            aria-pressed={candidate.revision === asset.revision}
            className={cn(
              'rounded-md border border-subtle px-2 py-1 text-xs',
              candidate.revision === asset.revision && 'bg-surface-1'
            )}
            onClick={() => onSelectRevision(candidate.revision)}
          >
            {candidate.revision}
            {candidate.revision === pilotCase.activeRevision ? ' · active' : ''}
          </button>
        ))}
      </div>
      <ReviewCanvas
        key={`${asset.contentDigest}:${asset.revision}`}
        asset={asset}
        marks={pilotCase}
        stale={stale}
        newerRevision={stale ? pilotCase.activeRevision : undefined}
        readOnly={!canRequest}
        busy={busy}
        onSave={onRequestChanges}
      />
      {comments.length ? (
        <ul className='space-y-1 text-xs text-secondary-token'>
          {comments.map(comment => (
            <li key={comment.id}>
              <span className='font-medium'>
                {comment.author === 'agent' ? 'Designer' : 'You'}:
              </span>{' '}
              {comment.body}
            </li>
          ))}
        </ul>
      ) : null}
      {pilotCase.privateLibraryReceipt ? (
        <p className='text-xs text-secondary-token' role='status'>
          Accepted {pilotCase.acceptedRevision}. Stored:{' '}
          {pilotCase.privateLibraryReceipt}
        </p>
      ) : pilotCase.lifecycle === 'changes_requested' ? (
        <button
          type='button'
          disabled={busy}
          className='rounded-lg border border-subtle px-3 py-2 text-sm disabled:opacity-40'
          onClick={onAcceptV2}
        >
          Accept v2
        </button>
      ) : null}
    </div>
  );
}
