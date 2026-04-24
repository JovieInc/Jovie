'use client';

import { Button } from '@jovie/ui';
import { Undo2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogMismatch } from './types';

type MismatchAction = 'confirmed_mismatch' | 'dismissed';

interface MismatchCardProps {
  readonly mismatch: CatalogMismatch;
  readonly onAction: (id: string, status: MismatchAction) => Promise<boolean>;
  readonly onRemoved: (id: string, action: MismatchAction) => void;
}

const UNDO_DELAY_MS = 3000;

export function MismatchCard({
  mismatch,
  onAction,
  onRemoved,
}: MismatchCardProps) {
  const [pendingAction, setPendingAction] = useState<MismatchAction | null>(
    null
  );
  const [error, setError] = useState(false);
  const [removing, setRemoving] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => clearTimer, [clearTimer]);

  const handleAction = useCallback(
    (action: MismatchAction) => {
      setError(false);
      setPendingAction(action);

      undoTimerRef.current = setTimeout(async () => {
        const success = await onAction(mismatch.id, action);
        if (success) {
          setRemoving(true);
          // Allow animation to complete before notifying parent
          setTimeout(() => onRemoved(mismatch.id, action), 300);
        } else {
          setError(true);
          setPendingAction(null);
        }
      }, UNDO_DELAY_MS);
    },
    [mismatch.id, onAction, onRemoved]
  );

  const handleUndo = useCallback(() => {
    clearTimer();
    setPendingAction(null);
    setError(false);
  }, [clearTimer]);

  const handleRetry = useCallback(() => {
    setError(false);
    handleAction(pendingAction ?? 'dismissed');
  }, [handleAction, pendingAction]);

  const spotifyUrl = mismatch.externalTrackId
    ? `https://open.spotify.com/track/${mismatch.externalTrackId}`
    : null;

  // Removing state — animate out
  if (removing) {
    return (
      <div
        className='overflow-hidden transition-all duration-300 ease-out'
        style={{ maxHeight: 0, opacity: 0, marginBottom: 0 }}
        aria-hidden='true'
      />
    );
  }

  // Undo pending state
  if (pendingAction && !error) {
    return (
      <div
        className='flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5 transition-all'
        role='status'
        aria-live='polite'
      >
        <span className='text-xs text-muted-foreground'>
          {pendingAction === 'confirmed_mismatch'
            ? 'Marked as not yours'
            : 'Dismissed'}
        </span>
        <Button
          variant='ghost'
          size='sm'
          onClick={handleUndo}
          className='h-7 gap-1.5 text-xs'
        >
          <Undo2 className='h-3 w-3' />
          Undo
        </Button>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className='flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5'
        role='alert'
      >
        <span className='text-xs text-destructive'>
          Failed to update. Try again.
        </span>
        <Button
          variant='ghost'
          size='sm'
          onClick={handleRetry}
          className='h-7 text-xs'
        >
          Retry
        </Button>
      </div>
    );
  }

  // Normal card state
  return (
    <li className='list-none group flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 transition-all hover:bg-accent/50'>
      {/* Artwork — clickable to Spotify */}
      {spotifyUrl && (
        <a
          href={spotifyUrl}
          target='_blank'
          rel='noopener noreferrer'
          className='flex-shrink-0'
          aria-label={`Open ${mismatch.externalTrackName ?? 'track'} on Spotify`}
        >
          {mismatch.externalArtworkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mismatch.externalArtworkUrl}
              alt=''
              className='h-8 w-8 rounded object-cover'
            />
          ) : (
            <div className='h-8 w-8 rounded bg-muted' />
          )}
        </a>
      )}
      {!spotifyUrl && mismatch.externalArtworkUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mismatch.externalArtworkUrl}
          alt=''
          className='h-8 w-8 flex-shrink-0 rounded object-cover'
        />
      )}
      {!spotifyUrl && !mismatch.externalArtworkUrl && (
        <div className='h-8 w-8 flex-shrink-0 rounded bg-muted' />
      )}

      {/* Track info — desktop: single line, mobile: wraps */}
      <div className='min-w-0 flex-1'>
        <p className='truncate text-[13px] font-book'>
          {mismatch.externalTrackName ?? mismatch.isrc}
        </p>
        <p className='truncate text-[11px] text-muted-foreground'>
          {mismatch.externalArtistNames ?? 'Unknown artist'}
          {mismatch.externalAlbumName ? ` · ${mismatch.externalAlbumName}` : ''}
        </p>
      </div>

      {/* Action buttons — desktop: inline, mobile: full-width stacked */}
      <div className='flex flex-shrink-0 gap-1.5 max-sm:w-full max-sm:flex-col sm:gap-2'>
        <Button
          variant='outline'
          size='sm'
          className='h-7 min-w-[52px] text-xs max-sm:h-10 max-sm:flex-1'
          onClick={() => handleAction('dismissed')}
        >
          Mine
        </Button>
        <Button
          variant='destructive'
          size='sm'
          className='h-7 min-w-[68px] text-xs max-sm:h-10 max-sm:flex-1'
          onClick={() => handleAction('confirmed_mismatch')}
        >
          Not Mine
        </Button>
      </div>
    </li>
  );
}
