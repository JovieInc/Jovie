'use client';

import Image from 'next/image';
import { useId, useRef, useState } from 'react';
import { AppSegmentControl } from '@/components/atoms/AppSegmentControl';
import type {
  ReviewInboxCandidate,
  ReviewInboxMarks,
  ReviewInboxPin,
  ReviewInboxPoint,
  ReviewInboxStroke,
} from '@/lib/ovie/review-inbox/contract';
import { REVIEW_INBOX_MARK_LIMITS } from '@/lib/ovie/review-inbox/contract';
import { marksForAsset, normalizePoint } from '@/lib/ovie/review-inbox/marks';
import { cn } from '@/lib/utils';
import { ReviewCanvasOverlay } from './ReviewCanvasOverlay';

export type ReviewCanvasTool = 'pin' | 'draw';

export interface ReviewCanvasDraft {
  readonly pins: readonly Omit<ReviewInboxPin, 'author'>[];
  readonly strokes: readonly Omit<ReviewInboxStroke, 'author'>[];
  readonly comment: string;
}

export interface ReviewCanvasProps {
  /** Immutable asset bytes being reviewed (digest + revision key the marks). */
  readonly asset: ReviewInboxCandidate;
  /** Saved marks; the canvas shows only the ones made on this asset revision. */
  readonly marks: ReviewInboxMarks;
  /** Saves the draft with this revision. Throw to keep the draft for retry. */
  readonly onSave: (draft: ReviewCanvasDraft) => Promise<void> | void;
  /** A newer revision exists: saved marks show as stale and drawing is off. */
  readonly stale?: boolean;
  readonly newerRevision?: string;
  readonly readOnly?: boolean;
  readonly busy?: boolean;
  /** Smaller frame for embedding (for example the Ovie composer dock). */
  readonly compact?: boolean;
  readonly saveLabel?: string;
}

const TOOL_OPTIONS = [
  { value: 'pin' as const, label: 'Pin' },
  { value: 'draw' as const, label: 'Draw' },
];
const KEY_STEP = 0.02;
const KEY_STEP_LARGE = 0.1;
/** Skip pointer samples closer than this (normalized) to keep strokes small. */
const MIN_POINT_GAP = 0.004;

type DraftMark = { readonly kind: 'pin' | 'stroke'; readonly id: string };

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

/**
 * Self-contained annotation canvas: pins with notes and freehand SVG strokes
 * in normalized 0..1 image space, bound to one asset digest + revision.
 * Pointer events cover mouse, pen and touch; the surface is keyboard operable
 * (arrows move a cursor, Enter places a pin or starts/ends a stroke).
 */
export function ReviewCanvas({
  asset,
  marks,
  onSave,
  stale = false,
  newerRevision,
  readOnly = false,
  busy = false,
  compact = false,
  saveLabel = 'Request changes',
}: ReviewCanvasProps) {
  const surfaceRef = useRef<HTMLButtonElement>(null);
  const activeStrokeRef = useRef<ReviewInboxPoint[] | null>(null);
  const [tool, setTool] = useState<ReviewCanvasTool>('pin');
  const [draftPins, setDraftPins] = useState<Omit<ReviewInboxPin, 'author'>[]>(
    []
  );
  const [draftStrokes, setDraftStrokes] = useState<
    Omit<ReviewInboxStroke, 'author'>[]
  >([]);
  const [history, setHistory] = useState<DraftMark[]>([]);
  const [activeStroke, setActiveStroke] = useState<ReviewInboxPoint[] | null>(
    null
  );
  const [pinNote, setPinNote] = useState('');
  const [comment, setComment] = useState('');
  const [cursor, setCursor] = useState<ReviewInboxPoint>([0.5, 0.5]);
  const [focused, setFocused] = useState(false);
  const [status, setStatus] = useState('');
  const noteId = useId();
  const commentId = useId();
  const helpId = useId();

  const editable = !readOnly && !stale;
  const saved = marksForAsset(marks, asset);
  const draftCount = draftPins.length + draftStrokes.length;
  const pinCount = saved.pins.length + draftPins.length;

  function addPin([x, y]: ReviewInboxPoint) {
    const note = pinNote.trim();
    if (!note) {
      setStatus('Type a note for the pin first.');
      return;
    }
    if (pinCount >= REVIEW_INBOX_MARK_LIMITS.pins) {
      setStatus('Pin limit reached.');
      return;
    }
    const id = newId('pin');
    setDraftPins(current => [
      ...current,
      {
        id,
        assetDigest: asset.contentDigest,
        revision: asset.revision,
        x,
        y,
        note: note.slice(0, REVIEW_INBOX_MARK_LIMITS.noteChars),
      },
    ]);
    setHistory(current => [...current, { kind: 'pin', id }]);
    setPinNote('');
    setStatus('Pin added.');
  }

  function startStroke(point: ReviewInboxPoint) {
    if (
      saved.strokes.length + draftStrokes.length >=
      REVIEW_INBOX_MARK_LIMITS.strokes
    ) {
      setStatus('Stroke limit reached.');
      return;
    }
    activeStrokeRef.current = [point];
    setActiveStroke([point]);
  }

  function extendStroke(point: ReviewInboxPoint, force = false) {
    const points = activeStrokeRef.current;
    if (!points) return;
    const last = points.at(-1);
    if (
      last &&
      !force &&
      Math.hypot(point[0] - last[0], point[1] - last[1]) < MIN_POINT_GAP
    )
      return;
    if (points.length >= REVIEW_INBOX_MARK_LIMITS.pointsPerStroke) return;
    const next = [...points, point];
    activeStrokeRef.current = next;
    setActiveStroke(next);
  }

  function finishStroke() {
    const points = activeStrokeRef.current;
    activeStrokeRef.current = null;
    setActiveStroke(null);
    const first = points?.[0];
    if (!points || !first) return;
    // A tap is a dot: two identical points keep the contract's 2-point floor.
    const finished = points.length === 1 ? [first, first] : points;
    const id = newId('stroke');
    setDraftStrokes(current => [
      ...current,
      {
        id,
        assetDigest: asset.contentDigest,
        revision: asset.revision,
        points: finished,
      },
    ]);
    setHistory(current => [...current, { kind: 'stroke', id }]);
    setStatus('Stroke added.');
  }

  function undo() {
    const last = history.at(-1);
    if (!last) return;
    setHistory(current => current.slice(0, -1));
    if (last.kind === 'pin')
      setDraftPins(current => current.filter(pin => pin.id !== last.id));
    else
      setDraftStrokes(current =>
        current.filter(stroke => stroke.id !== last.id)
      );
    setStatus(last.kind === 'pin' ? 'Pin removed.' : 'Stroke removed.');
  }

  function pointFromEvent(event: React.PointerEvent): ReviewInboxPoint | null {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return normalizePoint(
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height
    );
  }

  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (!editable || event.button > 0) return;
    const point = pointFromEvent(event);
    if (!point) return;
    if (tool === 'draw') {
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      startStroke(point);
    }
  }

  function onPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (tool !== 'draw' || !activeStrokeRef.current) return;
    const point = pointFromEvent(event);
    if (point) extendStroke(point);
  }

  function onPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    if (!editable) return;
    if (tool === 'draw') {
      if (activeStrokeRef.current) {
        const point = pointFromEvent(event);
        if (point) extendStroke(point);
        finishStroke();
      }
      return;
    }
    const point = pointFromEvent(event);
    if (point) addPin(point);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.target !== event.currentTarget || !editable) return;
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    const moves: Record<string, ReviewInboxPoint> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      const next = normalizePoint(cursor[0] + move[0], cursor[1] + move[1]);
      setCursor(next);
      if (tool === 'draw') extendStroke(next, true);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (tool === 'pin') addPin(cursor);
      else if (activeStrokeRef.current) finishStroke();
      else {
        startStroke(cursor);
        setStatus('Drawing. Use arrow keys, then Enter to finish.');
      }
      return;
    }
    if (event.key === 'Escape' && activeStrokeRef.current) {
      event.preventDefault();
      activeStrokeRef.current = null;
      setActiveStroke(null);
      setStatus('Stroke cancelled.');
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undo();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'p' || event.key === 'd') {
      event.preventDefault();
      setTool(event.key === 'p' ? 'pin' : 'draw');
    }
  }

  async function save() {
    if (!draftCount || busy) return;
    try {
      await onSave({
        pins: draftPins,
        strokes: draftStrokes,
        comment: comment.trim(),
      });
      setDraftPins([]);
      setDraftStrokes([]);
      setHistory([]);
      setComment('');
      setStatus('Saved with this revision.');
    } catch {
      setStatus('Not saved. Your marks are still here; try again.');
    }
  }

  const savedPins = saved.pins.map((pin, index) => ({
    ...pin,
    label: index + 1,
    draft: false,
  }));
  const allPins = [
    ...savedPins,
    ...draftPins.map((pin, index) => ({
      ...pin,
      author: 'founder' as const,
      label: savedPins.length + index + 1,
      draft: true,
    })),
  ];

  return (
    <section
      className={cn('space-y-3', compact ? 'max-w-md' : 'max-w-3xl')}
      data-testid='review-canvas'
      aria-label={`Annotate ${asset.label} (${asset.revision})`}
    >
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-xs text-secondary-token'>
          {asset.label} · {asset.revision}
          {stale ? (
            <span
              className='ml-2 rounded-sm border border-subtle px-1.5 py-0.5 text-2xs text-warning-text'
              data-testid='review-canvas-stale'
            >
              Stale{newerRevision ? ` · ${newerRevision} is newer` : ''}
            </span>
          ) : null}
        </p>
        {editable ? (
          <div className='flex items-center gap-2'>
            <AppSegmentControl<ReviewCanvasTool>
              value={tool}
              options={TOOL_OPTIONS}
              onValueChange={setTool}
              semantics='radio'
              aria-label='Annotation Tool'
            />
            <button
              type='button'
              className='rounded-md border border-subtle px-2 py-1 text-xs disabled:opacity-40'
              onClick={undo}
              disabled={!history.length}
            >
              Undo
            </button>
          </div>
        ) : null}
      </div>

      <button
        type='button'
        ref={surfaceRef}
        aria-label={`${asset.label} canvas, ${tool === 'pin' ? 'pin' : 'draw'} tool`}
        aria-describedby={helpId}
        disabled={!editable}
        data-testid='review-canvas-surface'
        data-tool={tool}
        className={cn(
          'relative block w-full overflow-hidden rounded-lg border border-subtle bg-surface-1 p-0 outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-default',
          editable && tool === 'draw' && 'cursor-crosshair touch-none',
          editable && tool === 'pin' && 'cursor-cell'
        )}
        style={{ aspectRatio: `${asset.width} / ${asset.height}` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={finishStroke}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <Image
          src={asset.src}
          alt={asset.label}
          width={asset.width}
          height={asset.height}
          unoptimized
          draggable={false}
          className='pointer-events-none size-full select-none object-fill'
        />
        <ReviewCanvasOverlay
          savedStrokes={saved.strokes}
          draftStrokes={draftStrokes}
          activeStroke={activeStroke}
          pins={allPins}
          stale={stale}
        />
        {editable && focused ? (
          <span
            aria-hidden='true'
            className='pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-focus'
            style={{ left: `${cursor[0] * 100}%`, top: `${cursor[1] * 100}%` }}
          />
        ) : null}
      </button>

      <p id={helpId} className='text-2xs text-tertiary-token'>
        {editable
          ? 'Pin: type a note, then tap the image. Draw: drag on the image. Keyboard: focus the image, arrows move, Enter places or starts and ends a stroke, P and D switch tools, Ctrl or Cmd+Z undoes.'
          : stale
            ? 'These marks were made on an older revision.'
            : 'Read only.'}
      </p>

      {allPins.length ? (
        <ol className='space-y-1 text-xs text-secondary-token'>
          {allPins.map(pin => (
            <li key={pin.id}>
              <span className='font-medium tabular-nums'>{pin.label}.</span>{' '}
              {pin.author === 'agent' ? 'Designer: ' : ''}
              {pin.note}
              {pin.draft ? ' (not saved)' : ''}
            </li>
          ))}
        </ol>
      ) : null}

      {editable ? (
        <div className='space-y-2'>
          {tool === 'pin' ? (
            <div>
              <label htmlFor={noteId} className='text-xs text-secondary-token'>
                Pin note
              </label>
              <input
                id={noteId}
                className='mt-1 block w-full rounded-lg border border-subtle bg-surface-0 px-3 py-2 text-sm'
                value={pinNote}
                maxLength={REVIEW_INBOX_MARK_LIMITS.noteChars}
                onChange={event => setPinNote(event.target.value)}
                placeholder='What should change here?'
              />
            </div>
          ) : null}
          {compact ? null : (
            <div>
              <label
                htmlFor={commentId}
                className='text-xs text-secondary-token'
              >
                Comment (optional)
              </label>
              <textarea
                id={commentId}
                className='mt-1 block w-full rounded-lg border border-subtle bg-surface-0 px-3 py-2 text-sm'
                rows={2}
                value={comment}
                maxLength={REVIEW_INBOX_MARK_LIMITS.commentChars}
                onChange={event => setComment(event.target.value)}
              />
            </div>
          )}
          <div className='flex items-center gap-3'>
            <button
              type='button'
              className='rounded-lg bg-primary px-3 py-2 text-sm font-medium text-on-primary disabled:opacity-40'
              disabled={busy || !draftCount}
              onClick={() => void save()}
            >
              {saveLabel}
            </button>
            <span className='text-xs tabular-nums text-tertiary-token'>
              {draftCount
                ? `${draftCount} unsaved mark${draftCount === 1 ? '' : 's'}`
                : 'No unsaved marks'}
            </span>
          </div>
        </div>
      ) : null}

      <p
        className='min-h-4 text-xs text-secondary-token'
        role='status'
        aria-live='polite'
      >
        {status}
      </p>
    </section>
  );
}
