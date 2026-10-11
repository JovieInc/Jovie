'use client';

import { Button, IconButton } from '@jovie/ui';
import { Check, RotateCcw, X } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useRef, useState } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';
import type { ChatAlbumArtCandidate } from '../types';

const SWIPE_DISTANCE_THRESHOLD_PX = 72;
const SWIPE_VELOCITY_THRESHOLD = 0.35;

export type AlbumArtSwipePreference = 'on' | 'off' | 'undecided';

export const ALBUM_ART_SWIPE_PREFERENCE_KEY = 'jovie.album-art-swipe-mode';

export function readAlbumArtSwipePreference(): AlbumArtSwipePreference {
  if (globalThis.window === undefined) return 'undecided';
  try {
    const stored = globalThis.localStorage.getItem(
      ALBUM_ART_SWIPE_PREFERENCE_KEY
    );
    return stored === 'on' || stored === 'off' ? stored : 'undecided';
  } catch {
    return 'undecided';
  }
}

export function writeAlbumArtSwipePreference(
  preference: Exclude<AlbumArtSwipePreference, 'undecided'>
): void {
  try {
    globalThis.localStorage.setItem(ALBUM_ART_SWIPE_PREFERENCE_KEY, preference);
  } catch {
    // Storage unavailable (private mode, quota): keep in-session state only.
  }
}

interface ChatAlbumArtSwipeReviewProps {
  readonly releaseTitle: string;
  readonly candidates: readonly ChatAlbumArtCandidate[];
  readonly appliedCandidateId: string | null;
  readonly isActionPending: boolean;
  readonly onAccept: (candidate: ChatAlbumArtCandidate) => void;
  readonly onRequestMore: () => void;
  readonly onExitSwipeMode: () => void;
}

/**
 * Tinder-style one-at-a-time review for generated album-art candidates.
 * Swipe right (or ArrowRight / the accept button) applies the candidate;
 * swipe left rejects it and advances. When the deck runs out, the user can
 * request a fresh set. Pointer, button, and keyboard paths are equivalent;
 * reduced-motion removes the drag transform.
 */
export function ChatAlbumArtSwipeReview({
  releaseTitle,
  candidates,
  appliedCandidateId,
  isActionPending,
  onAccept,
  onRequestMore,
  onExitSwipeMode,
}: ChatAlbumArtSwipeReviewProps) {
  const prefersReducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const regionRef = useRef<HTMLFieldSetElement | null>(null);
  const swipeRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startTime: number;
    isVertical: boolean;
  } | null>(null);

  const candidate = candidates[index] ?? null;
  const exhausted = candidate == null;

  const endDrag = useCallback(() => {
    swipeRef.current = null;
    setIsDragging(false);
    setDragX(0);
  }, []);

  const reject = useCallback(() => {
    endDrag();
    setIndex(previous => Math.min(previous + 1, candidates.length));
  }, [candidates.length, endDrag]);

  const accept = useCallback(() => {
    if (!candidate || isActionPending) return;
    endDrag();
    onAccept(candidate);
  }, [candidate, endDrag, isActionPending, onAccept]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLFieldSetElement>) => {
      if (exhausted || event.button !== 0) return;
      swipeRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startTime: event.timeStamp,
        isVertical: false,
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setIsDragging(true);
    },
    [exhausted]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLFieldSetElement>) => {
      const state = swipeRef.current;
      if (!state || state.pointerId !== event.pointerId) return;

      const deltaX = event.clientX - state.startX;
      const deltaY = event.clientY - state.startY;

      if (!state.isVertical && Math.abs(deltaY) > Math.abs(deltaX) + 8) {
        state.isVertical = true;
        endDrag();
        return;
      }
      if (state.isVertical) return;
      setDragX(deltaX);
    },
    [endDrag]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLFieldSetElement>) => {
      const state = swipeRef.current;
      if (!state || state.pointerId !== event.pointerId) return;

      const deltaX = event.clientX - state.startX;
      const elapsed = event.timeStamp - state.startTime;
      const width = regionRef.current?.offsetWidth ?? 1;
      const distanceRatio = Math.abs(deltaX) / Math.max(width, 1);
      const velocity = Math.abs(deltaX) / Math.max(elapsed, 1);

      if (
        Math.abs(deltaX) >= SWIPE_DISTANCE_THRESHOLD_PX ||
        distanceRatio >= 0.3 ||
        velocity >= SWIPE_VELOCITY_THRESHOLD
      ) {
        if (deltaX > 0) accept();
        else reject();
      } else {
        endDrag();
      }
    },
    [accept, endDrag, reject]
  );

  const handlePointerCancel = useCallback(() => endDrag(), [endDrag]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLFieldSetElement>) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        reject();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        accept();
      }
    },
    [accept, reject]
  );

  const cardTransform =
    prefersReducedMotion || !isDragging
      ? undefined
      : `translateX(${dragX}px) rotate(${dragX / 24}deg)`;

  const swipeProgress = Math.min(
    Math.abs(dragX) / SWIPE_DISTANCE_THRESHOLD_PX,
    1
  );

  return (
    <div className='mt-3'>
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: the fieldset groups the focusable reject/accept buttons and tracks swipes across the whole card; keyboard users get arrow-key handling via focus inside it. */}
      <fieldset
        ref={regionRef}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className='relative m-0 mx-auto w-full max-w-xs touch-pan-y select-none border-0 p-0'
        data-testid='album-art-swipe-region'
      >
        <legend className='sr-only'>
          Swipe review for {releaseTitle} album art. Left arrow rejects, right
          arrow accepts.
        </legend>
        {candidate ? (
          <div
            className={cn(
              'relative overflow-hidden rounded-xl border border-subtle bg-surface-2',
              !prefersReducedMotion &&
                'transition-transform duration-subtle ease-out',
              isDragging && !prefersReducedMotion && 'transition-none'
            )}
            style={{ transform: cardTransform }}
          >
            <span className='relative block aspect-square w-full bg-surface-1'>
              <Image
                src={candidate.previewUrl}
                alt={`${releaseTitle} album art in ${candidate.styleLabel} style`}
                fill
                className='object-contain'
                sizes='320px'
                unoptimized
                draggable={false}
              />
            </span>
            <span className='flex items-center justify-between border-t border-subtle px-3 py-2'>
              <span className='text-3xs font-medium text-secondary-token'>
                {candidate.styleLabel}
              </span>
              <span className='text-3xs text-tertiary-token'>
                {index + 1} of {candidates.length}
              </span>
            </span>
            {isDragging && dragX > 0 ? (
              <span
                aria-hidden='true'
                className='absolute inset-0 flex items-start justify-start rounded-xl bg-success-subtle/40 p-3 text-success'
                style={{ opacity: swipeProgress }}
              >
                <Check className='size-6' strokeWidth={3} />
              </span>
            ) : null}
            {isDragging && dragX < 0 ? (
              <span
                aria-hidden='true'
                className='absolute inset-0 flex items-start justify-end rounded-xl bg-error-subtle/40 p-3 text-error'
                style={{ opacity: swipeProgress }}
              >
                <X className='size-6' strokeWidth={3} />
              </span>
            ) : null}
          </div>
        ) : (
          <div
            className='flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-xl border border-subtle bg-surface-1 p-4 text-center'
            data-testid='album-art-swipe-exhausted'
          >
            <p className='text-xs text-secondary-token'>
              That was the last candidate for this set.
            </p>
            <div className='flex flex-wrap items-center justify-center gap-2'>
              <Button type='button' size='sm' onClick={onRequestMore}>
                Request Another Set
              </Button>
              <Button
                type='button'
                size='sm'
                variant='secondary'
                onClick={() => setIndex(0)}
              >
                <RotateCcw className='size-3.5' />
                Review Again
              </Button>
            </div>
          </div>
        )}
      </fieldset>

      <output
        aria-live='polite'
        className='sr-only'
        data-testid='album-art-swipe-status'
      >
        {candidate
          ? `Candidate ${index + 1} of ${candidates.length}: ${candidate.styleLabel}`
          : 'No more candidates in this set.'}
      </output>

      {candidate ? (
        <div className='mt-3 flex items-center justify-center gap-3'>
          <IconButton
            type='button'
            variant='surface'
            size='lg'
            aria-label={`Reject ${candidate.styleLabel} artwork`}
            onClick={reject}
            disabled={isActionPending}
          >
            <X className='size-5' />
          </IconButton>
          <IconButton
            type='button'
            variant='surface'
            size='lg'
            aria-label={`Accept ${candidate.styleLabel} artwork`}
            onClick={accept}
            disabled={isActionPending}
          >
            <Check className='size-5' />
          </IconButton>
        </div>
      ) : null}

      {appliedCandidateId === candidate?.id ? (
        <p className='mt-2 text-center text-xs text-success'>Artwork Applied</p>
      ) : null}

      <div className='mt-2 text-center'>
        <Button
          type='button'
          size='sm'
          variant='tertiary'
          onClick={onExitSwipeMode}
        >
          Switch To Grid View
        </Button>
      </div>
    </div>
  );
}
