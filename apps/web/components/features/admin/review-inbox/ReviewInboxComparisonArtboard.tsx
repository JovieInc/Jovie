'use client';

import Image from 'next/image';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type {
  ReviewInboxCandidate,
  ReviewInboxPin,
} from '@/lib/ovie/review-inbox/contract';
import { cn } from '@/lib/utils';

interface ReviewInboxComparisonArtboardProps {
  readonly candidates: readonly ReviewInboxCandidate[];
  readonly activeRevision: string;
  readonly pins: readonly ReviewInboxPin[];
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onAddPin: (pin: Omit<ReviewInboxPin, 'author'>) => void;
  readonly draftNote: string;
  readonly onDraftNoteChange: (value: string) => void;
}

/**
 * Fullscreen comparison board: reposition instances, Space+drag pan, zoom/fit,
 * pins bound to asset digests. No in-place source editing.
 */
export function ReviewInboxComparisonArtboard({
  candidates,
  activeRevision,
  pins,
  open,
  onClose,
  onAddPin,
  draftNote,
  onDraftNoteChange,
}: ReviewInboxComparisonArtboardProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [spacePan, setSpacePan] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const noteId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = useCallback(() => {
    onClose();
    returnFocusRef.current?.focus();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !spacePan) {
        event.preventDefault();
        setSpacePan(true);
      }
      if (event.key === 'Escape') close();
      if (event.key === '=' || event.key === '+')
        setZoom(z => Math.min(3, z + 0.1));
      if (event.key === '-') setZoom(z => Math.max(0.5, z - 0.1));
      if (event.key === '0') {
        setZoom(1);
        setOffset({ x: 0, y: 0 });
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePan(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [close, open, spacePan]);

  const onPointerDown = (event: React.PointerEvent) => {
    if (!spacePan) return;
    setDragging(true);
    dragStart.current = {
      x: event.clientX,
      y: event.clientY,
      ox: offset.x,
      oy: offset.y,
    };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragging) return;
    setOffset({
      x: dragStart.current.ox + (event.clientX - dragStart.current.x),
      y: dragStart.current.oy + (event.clientY - dragStart.current.y),
    });
  };

  const placePin = (
    event: React.MouseEvent,
    candidate: ReviewInboxCandidate
  ) => {
    if (spacePan || !draftNote.trim()) return;
    if (candidate.revision !== activeRevision) return;
    const node = event.currentTarget as HTMLElement;
    const rect = node.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    onAddPin({
      id: `pin-${Date.now()}`,
      assetDigest: candidate.contentDigest,
      revision: candidate.revision,
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
      note: draftNote.trim(),
    });
    onDraftNoteChange('');
  };

  return (
    <dialog
      ref={dialogRef}
      className='m-0 h-dvh max-h-dvh w-dvw max-w-dvw border-0 bg-canvas-0 p-0 text-primary-token backdrop:bg-black/70'
      aria-label='Comparison Artboard'
      onClose={close}
    >
      <div className='flex h-full flex-col'>
        <header className='flex shrink-0 items-center justify-between gap-3 border-b border-subtle px-4 py-3'>
          <p className='text-sm font-medium'>Compare candidates</p>
          <MotionReducedToolbar
            zoom={zoom}
            onZoomIn={() => setZoom(z => Math.min(3, z + 0.1))}
            onZoomOut={() => setZoom(z => Math.max(0.5, z - 0.1))}
            onFit={() => {
              setZoom(1);
              setOffset({ x: 0, y: 0 });
            }}
            onClose={close}
          />
        </header>
        <div
          ref={boardRef}
          className={cn(
            'relative min-h-0 flex-1 overflow-hidden bg-surface-0',
            spacePan && 'cursor-grab',
            dragging && 'cursor-grabbing'
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => setDragging(false)}
          onPointerLeave={() => setDragging(false)}
        >
          <div
            className='flex h-full items-start justify-center gap-6 p-6 motion-safe:transition-transform'
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            }}
          >
            {candidates.map(candidate => (
              <figure
                key={candidate.revision}
                className='relative max-w-2xl shrink-0'
              >
                <figcaption className='mb-2 text-xs text-secondary-token'>
                  {candidate.label} ({candidate.revision})
                </figcaption>
                <button
                  type='button'
                  className='relative block w-full border border-subtle bg-surface-1'
                  onClick={event => placePin(event, candidate)}
                  aria-label={`Place pin on ${candidate.label}`}
                >
                  <Image
                    src={candidate.src}
                    alt={candidate.label}
                    width={candidate.width}
                    height={candidate.height}
                    unoptimized
                    className='h-auto max-h-96 w-full object-contain'
                  />
                  {pins
                    .filter(
                      pin =>
                        pin.assetDigest === candidate.contentDigest &&
                        pin.revision === candidate.revision
                    )
                    .map(pin => (
                      <span
                        key={pin.id}
                        className='absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-warning ring-2 ring-canvas-0'
                        style={{
                          left: `${pin.x * 100}%`,
                          top: `${pin.y * 100}%`,
                        }}
                        title={pin.note}
                      />
                    ))}
                </button>
              </figure>
            ))}
          </div>
        </div>
        <footer className='shrink-0 border-t border-subtle px-4 py-3'>
          <label htmlFor={noteId} className='text-xs text-secondary-token'>
            Pin note (then click active revision)
          </label>
          <input
            id={noteId}
            className='mt-1 block w-full rounded-lg border border-subtle bg-surface-0 px-3 py-2 text-sm'
            value={draftNote}
            onChange={event => onDraftNoteChange(event.target.value)}
            placeholder='Describe the change'
          />
          <p className='mt-2 text-2xs text-tertiary-token'>
            Hold Space and drag to pan. + / − zoom; 0 resets. Pins bind to
            immutable asset bytes.
          </p>
        </footer>
      </div>
    </dialog>
  );
}

function MotionReducedToolbar({
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
  onClose,
}: Readonly<{
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onClose: () => void;
}>) {
  return (
    <div className='flex items-center gap-2'>
      <span className='text-xs tabular-nums text-tertiary-token'>
        {Math.round(zoom * 100)}%
      </span>
      <button
        type='button'
        className='rounded-md border border-subtle px-2 py-1 text-xs'
        onClick={onZoomOut}
      >
        Zoom out
      </button>
      <button
        type='button'
        className='rounded-md border border-subtle px-2 py-1 text-xs'
        onClick={onZoomIn}
      >
        Zoom in
      </button>
      <button
        type='button'
        className='rounded-md border border-subtle px-2 py-1 text-xs'
        onClick={onFit}
      >
        Fit
      </button>
      <button
        type='button'
        className='rounded-md border border-subtle px-2 py-1 text-xs'
        onClick={onClose}
      >
        Close
      </button>
    </div>
  );
}
