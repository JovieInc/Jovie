'use client';

import { Button, Textarea } from '@jovie/ui';
import { ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Avatar } from '@/components/molecules/Avatar';
import { EmptyState } from '@/components/molecules/EmptyState';
import type { OutreachEngineStatus } from '@/lib/outbound/cold/engine-types';
import {
  OUTBOUND_REJECT_REASON_LABELS,
  OUTBOUND_REJECT_REASONS,
  type OutboundCopy,
  type OutboundRejectReason,
  type OutboundRow,
} from '@/lib/outbound/types';
import { cn } from '@/lib/utils';
import { isTypingTarget } from './outbound-keys';

/**
 * Batch review: one certified prospect at a time, the artifact we built for
 * them, the email Tim would send and its follow-ups. Approve, edit, reject
 * with a reason, or skip, from the keyboard. Twenty in a few minutes.
 */

/** Approve the exact text shown for one person. */
export type ReviewDeckApprove = (
  row: OutboundRow,
  copy: OutboundCopy
) => Promise<void>;
/** Reject one person with a reason chip. */
export type ReviewDeckReject = (
  row: OutboundRow,
  choice: OutboundRejectReason
) => Promise<void>;

export interface OutboundReviewDeckProps {
  readonly rows: readonly OutboundRow[];
  readonly engine: OutreachEngineStatus | undefined;
  readonly pending: string | null;
  /** The last decision error, in Tim's words; null when none. */
  readonly error: string | null;
  readonly onApprove: ReviewDeckApprove;
  readonly onReject: ReviewDeckReject;
  readonly onExit: () => void;
}

/** Rows Tim can decide on now: certified, with a message and a channel. */
export function reviewableRows(rows: readonly OutboundRow[]): OutboundRow[] {
  return rows.filter(
    row =>
      row.nextAction === 'approve_message' &&
      row.channel !== null &&
      row.message !== null
  );
}

function percent(value: number | null): string {
  return value === null ? 'none yet' : `${Math.round(value * 100)}%`;
}

function LearningLine({
  engine,
  segment,
}: Readonly<{
  engine: OutreachEngineStatus | undefined;
  segment: string | null;
}>) {
  if (!engine) return null;
  const learning = engine.learning.find(item => item.segment === segment);
  const verdict = engine.autoApprove.find(item => item.segment === segment);
  return (
    <p
      className='text-2xs tabular-nums text-tertiary-token'
      data-testid='outbound-review-learning'
    >
      {learning
        ? `${learning.approvedUnchanged} of ${learning.reviewed} approved unchanged (${percent(learning.unchangedRate)}) · p95 edit ${percent(learning.editDistanceP95)}`
        : 'No reviews in this segment yet'}
      {' · '}
      {verdict?.mode === 'auto' ? 'Auto-send eligible' : 'Review required'}
    </p>
  );
}

function ControllerLine({
  engine,
}: Readonly<{ engine: OutreachEngineStatus | undefined }>) {
  if (!engine) return null;
  const { controller } = engine;
  return (
    <p
      className='text-2xs tabular-nums text-tertiary-token'
      data-testid='outbound-review-controller'
    >
      Dial {controller.dialTarget}/day ·{' '}
      {controller.state === 'running'
        ? `${controller.budgetToday} can send today`
        : `Sending closed: ${controller.blockerLabels.join(', ')}`}
    </p>
  );
}

function ArtifactPreview({ row }: Readonly<{ row: OutboundRow }>) {
  const image = row.profilePath ? `${row.profilePath}/opengraph-image` : null;
  return (
    <div className='overflow-hidden rounded-lg border border-subtle bg-surface-1'>
      <div className='relative aspect-video w-full bg-surface-0'>
        <div className='absolute inset-0 flex items-center justify-center'>
          <Avatar src={row.avatarUrl} alt='' name={row.name} size='xl' />
        </div>
        {image ? (
          // The OG render of the built page; if it fails, the avatar shows through.
          <div
            role='img'
            aria-label={`The page built for ${row.name}`}
            className='absolute inset-0 bg-cover bg-center'
            style={{ backgroundImage: `url(${JSON.stringify(image)})` }}
            data-testid='outbound-review-artifact'
          />
        ) : null}
      </div>
      {row.profilePath ? (
        <a
          href={row.profilePath}
          target='_blank'
          rel='noreferrer'
          className='flex items-center gap-1 px-3 py-2 text-xs text-secondary-token hover:text-primary-token'
        >
          Open what we built{' '}
          <ExternalLink className='h-3 w-3' aria-hidden='true' />
        </a>
      ) : null}
    </div>
  );
}

export function OutboundReviewDeck({
  rows,
  engine,
  pending,
  error,
  onApprove,
  onReject,
  onExit,
}: OutboundReviewDeckProps) {
  const deck = useMemo(() => reviewableRows(rows), [rows]);
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const row = deck[Math.min(index, Math.max(0, deck.length - 1))] ?? null;
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // Reset the editor when the person or their saved text changes, not on
  // every background refetch, so an edit in progress is never wiped.
  const leadId = row?.leadId ?? null;
  const initialSubject = row?.message?.subject ?? '';
  const initialBody = row?.message?.body ?? '';
  useEffect(() => {
    setSubject(initialSubject);
    setBody(initialBody);
    setEditing(false);
    setRejecting(false);
  }, [leadId, initialSubject, initialBody]);

  const channel = row?.channel ?? null;
  const messageChannel = row?.message?.channel ?? null;
  const copy = useMemo<OutboundCopy | null>(
    () =>
      messageChannel && channel
        ? {
            channel: messageChannel,
            subject: messageChannel === 'email' ? subject : null,
            body,
          }
        : null,
    [body, channel, messageChannel, subject]
  );
  const edited =
    row?.message !== null &&
    row?.message !== undefined &&
    (body !== row.message.body ||
      (row.message.channel === 'email' &&
        subject !== (row.message.subject ?? '')));

  const skip = useCallback(
    () => setIndex(current => Math.min(current + 1, deck.length)),
    [deck.length]
  );
  const back = useCallback(
    () => setIndex(current => Math.max(0, current - 1)),
    []
  );
  const approve = useCallback(async () => {
    if (!row || !copy || pending) return;
    await onApprove(row, copy);
  }, [copy, onApprove, pending, row]);
  const reject = useCallback(
    async (reason: OutboundRejectReason) => {
      if (!row || pending) return;
      setRejecting(false);
      await onReject(row, reason);
    },
    [onReject, pending, row]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (editing) setEditing(false);
        else if (rejecting) setRejecting(false);
        else onExit();
        return;
      }
      if (isTypingTarget(event.target)) return;
      if (rejecting) {
        const choice = OUTBOUND_REJECT_REASONS[Number(event.key) - 1];
        if (choice) {
          event.preventDefault();
          void reject(choice);
        }
        return;
      }
      const action: Record<string, () => void> = {
        a: () => void approve(),
        e: () => setEditing(true),
        r: () => setRejecting(true),
        s: skip,
        ArrowRight: skip,
        ArrowLeft: back,
      };
      const run = action[event.key];
      if (run) {
        event.preventDefault();
        run();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [approve, back, editing, onExit, reject, rejecting, skip]);

  if (!row) {
    return (
      <div
        className='flex h-full items-center justify-center p-6'
        data-testid='outbound-review-deck'
      >
        <EmptyState
          presentation='quiet'
          heading='Nothing To Review'
          action={{ label: 'Back To List', onClick: onExit }}
        />
      </div>
    );
  }

  const followUps = row.draft?.followUps ?? [];
  return (
    <div
      className='mx-auto flex h-full w-full max-w-5xl min-h-0 flex-col gap-4 overflow-y-auto p-4'
      data-testid='outbound-review-deck'
    >
      <div className='flex items-center gap-3'>
        <span
          className='text-xs tabular-nums text-tertiary-token'
          data-testid='outbound-review-progress'
        >
          {Math.min(index + 1, deck.length)} of {deck.length}
        </span>
        <div className='ml-auto flex flex-col items-end gap-0.5'>
          <LearningLine engine={engine} segment={row.draft?.segment ?? null} />
          <ControllerLine engine={engine} />
        </div>
      </div>

      <div className='grid min-h-0 gap-4 md:grid-cols-12'>
        <section
          aria-label='Prospect'
          className='flex min-w-0 flex-col gap-3 md:col-span-5'
        >
          <div className='flex items-center gap-2'>
            <Avatar src={row.avatarUrl} alt='' name={row.name} size='md' />
            <div className='min-w-0'>
              <h2 className='truncate text-app font-medium text-primary-token'>
                {row.name}
              </h2>
              <p className='truncate text-xs text-tertiary-token'>
                @{row.handle}
              </p>
            </div>
          </div>
          <dl className='grid grid-cols-3 gap-x-3 gap-y-1 text-xs'>
            <dt className='text-tertiary-token'>Why now</dt>
            <dd className='col-span-2 text-secondary-token'>
              {row.whyNow ?? 'No dated trigger'}
            </dd>
            <dt className='text-tertiary-token'>Fit</dt>
            <dd className='col-span-2 tabular-nums text-secondary-token'>
              {row.fitBasis === 'scored'
                ? `${row.fit} (${row.fitScore ?? 'n/a'})`
                : 'Not scored'}
            </dd>
            <dt className='text-tertiary-token'>Segment</dt>
            <dd className='col-span-2 text-secondary-token'>
              {row.draft?.segment ?? 'Unknown'}
            </dd>
          </dl>
          <ArtifactPreview row={row} />
        </section>

        <section
          aria-label='Email'
          className='flex min-w-0 flex-col gap-2 md:col-span-7'
        >
          {row.message?.channel === 'email' ? (
            <input
              aria-label='Subject'
              value={subject}
              readOnly={!editing}
              onChange={event => setSubject(event.target.value)}
              onFocus={() => setEditing(true)}
              className='h-8 w-full rounded-md border border-strong bg-surface-0 px-2 text-sm text-primary-token'
            />
          ) : null}
          <Textarea
            aria-label='Message Body'
            value={body}
            readOnly={!editing}
            onChange={event => setBody(event.target.value)}
            onFocus={() => setEditing(true)}
            rows={11}
            resizable={false}
          />
          {followUps.length ? (
            <details className='rounded-md border border-subtle px-3 py-2'>
              <summary className='cursor-pointer text-xs text-secondary-token'>
                {followUps.length} follow-ups, stop on any reply, claim or
                unsubscribe
              </summary>
              <ol className='mt-2 space-y-3'>
                {followUps.map(step => (
                  <li
                    key={`${row.leadId}-${step.subject}-${step.body.length}`}
                    className='space-y-1'
                  >
                    <p className='text-2xs text-tertiary-token'>
                      {step.subject}
                    </p>
                    <p className='whitespace-pre-line text-xs text-secondary-token'>
                      {step.body}
                    </p>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}

          {rejecting ? (
            <fieldset className='flex flex-wrap gap-1.5'>
              <legend className='sr-only'>Reject Reason</legend>
              {OUTBOUND_REJECT_REASONS.map((reason, reasonIndex) => (
                <Button
                  key={reason}
                  size='sm'
                  variant='secondary'
                  disabled={pending !== null}
                  onClick={() => void reject(reason)}
                >
                  <span className='tabular-nums text-quaternary-token'>
                    {reasonIndex + 1}
                  </span>{' '}
                  {OUTBOUND_REJECT_REASON_LABELS[reason]}
                </Button>
              ))}
            </fieldset>
          ) : (
            <div className='flex items-center gap-1.5'>
              <Button
                size='sm'
                variant='primary'
                disabled={pending !== null || !copy}
                loading={pending === 'approve'}
                onClick={() => void approve()}
              >
                {edited ? 'Approve edit' : 'Approve'}
              </Button>
              <Button
                size='sm'
                variant='secondary'
                disabled={pending !== null}
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>
              <Button
                size='sm'
                variant='tertiary'
                disabled={pending !== null}
                onClick={() => setRejecting(true)}
              >
                Reject
              </Button>
              <Button
                size='sm'
                variant='tertiary'
                className='ml-auto'
                onClick={skip}
              >
                Skip
              </Button>
            </div>
          )}
          {error ? (
            <p role='status' className='text-xs text-error'>
              {error}
            </p>
          ) : null}
          <p className={cn('text-2xs text-tertiary-token')}>
            a approve · e edit · r reject, then 1 to{' '}
            {OUTBOUND_REJECT_REASONS.length} · s skip · ← back · esc exit.
            Approving records your decision; nothing sends until outbound opens.
          </p>
        </section>
      </div>
    </div>
  );
}
