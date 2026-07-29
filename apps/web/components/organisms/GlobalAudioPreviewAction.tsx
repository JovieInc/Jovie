'use client';

import {
  type AudioPlaybackSourceKind,
  getAudioPreviewSurfaceState,
} from '@jovie/audio-contracts';
import { Button } from '@jovie/ui';
import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { cn } from '@/lib/utils';

interface GlobalAudioPreviewActionProps {
  readonly id: string;
  readonly title: string;
  readonly audioUrl: string;
  readonly sourceKind: Extract<
    AudioPlaybackSourceKind,
    'release-preview' | 'chat-upload-preview'
  >;
  readonly releaseTitle?: string;
  readonly artistName?: string;
  readonly artworkUrl?: string | null;
  readonly stopOnUnmount?: boolean;
  readonly className?: string;
}

/**
 * Selects a preview for the shell-wide player without creating a second
 * transport. Once selected, this surface is deliberately status-only.
 */
export function GlobalAudioPreviewAction({
  id,
  title,
  audioUrl,
  sourceKind,
  releaseTitle,
  artistName,
  artworkUrl,
  stopOnUnmount = false,
  className,
}: GlobalAudioPreviewActionProps) {
  const { playbackState, toggleTrack, stop } = useTrackAudioPlayer();
  const surfaceState = getAudioPreviewSurfaceState({
    candidateId: id,
    candidateSourceKind: sourceKind,
    activeTrackId: playbackState.activeTrackId,
    activeSourceKind: playbackState.sourceKind,
    playbackStatus: playbackState.playbackStatus,
    isPlaying: playbackState.isPlaying,
  });
  const isActive = surfaceState.id !== 'selectable';
  const activeRef = useRef(isActive);
  const stopRef = useRef(stop);

  useEffect(() => {
    activeRef.current = isActive;
    stopRef.current = stop;
  }, [isActive, stop]);

  useEffect(() => {
    if (!stopOnUnmount) return;
    return () => {
      if (activeRef.current) stopRef.current();
    };
  }, [audioUrl, id, sourceKind, stopOnUnmount]);

  const handleSelect = useCallback(() => {
    void toggleTrack({
      id,
      title,
      audioUrl,
      sourceKind,
      releaseTitle,
      artistName,
      artworkUrl,
    }).catch(() => {});
  }, [
    artistName,
    artworkUrl,
    audioUrl,
    id,
    releaseTitle,
    sourceKind,
    title,
    toggleTrack,
  ]);

  if (isActive) {
    return (
      <span
        className={cn(
          'inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-secondary-token',
          className
        )}
        role='status'
        aria-live='polite'
        data-testid='global-audio-preview-status'
      >
        {surfaceState.pending ? (
          <Loader2
            className='h-3.5 w-3.5 animate-spin motion-reduce:animate-none'
            aria-hidden='true'
          />
        ) : null}
        {surfaceState.label}
      </span>
    );
  }

  return (
    <Button
      variant='secondary'
      size='md'
      onClick={handleSelect}
      className={cn('min-h-11 text-xs', className)}
      aria-label={`Preview ${title} in player`}
      data-testid='global-audio-preview-action'
    >
      {surfaceState.label}
    </Button>
  );
}
