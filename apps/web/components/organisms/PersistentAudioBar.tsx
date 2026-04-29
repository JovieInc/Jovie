'use client';

import { Pause, Play, X } from 'lucide-react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SeekBar } from '@/components/atoms/SeekBar';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { AudioBar, type AudioBarTrack } from '@/components/shell/AudioBar';
import { SidebarBottomNowPlaying } from '@/components/shell/SidebarBottomNowPlaying';
import { SidebarNowPlaying } from '@/components/shell/SidebarNowPlaying';
import { buildLyricsRoute } from '@/constants/routes';
import { useAppFlag } from '@/lib/flags/client';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils/formatDuration';

export type PersistentAudioBarVariant = 'legacy' | 'shellChatV1';

interface PersistentAudioBarProps {
  readonly variant?: PersistentAudioBarVariant;
}

export function PersistentAudioBar({
  variant = 'legacy',
}: Readonly<PersistentAudioBarProps>) {
  const router = useRouter();
  const pathname = usePathname();
  const designV1LyricsEnabled = useAppFlag('DESIGN_V1');
  const { playbackState, toggleTrack, seek, stop, onError } =
    useTrackAudioPlayer();
  const [imgError, setImgError] = useState(false);
  const [barCollapsed, setBarCollapsed] = useState(false);
  const [waveformOn, setWaveformOn] = useState(false);

  useEffect(() => {
    return onError(() => {
      toast.error('Preview unavailable', { id: 'audio-preview-error' });
    });
  }, [onError]);

  useEffect(() => {
    setImgError(false);
  }, [playbackState.artworkUrl]);

  useEffect(() => {
    setBarCollapsed(false);
  }, [playbackState.activeTrackId]);

  const handleToggle = useCallback(() => {
    if (playbackState.playbackStatus === 'loading') return;
    if (!playbackState.activeTrackId || !playbackState.trackTitle) return;
    toggleTrack({
      id: playbackState.activeTrackId,
      title: playbackState.trackTitle,
    }).catch(() => {});
  }, [
    playbackState.activeTrackId,
    playbackState.playbackStatus,
    playbackState.trackTitle,
    toggleTrack,
  ]);

  const handleOpenLyrics = useCallback(() => {
    if (!playbackState.activeTrackId) return;
    router.push(buildLyricsRoute(playbackState.activeTrackId));
  }, [playbackState.activeTrackId, router]);

  const activeTrackId = playbackState.activeTrackId;
  if (!activeTrackId) return null;

  const isLoading = playbackState.playbackStatus === 'loading';

  const currentTimeFormatted = formatDuration(
    Math.round(playbackState.currentTime) * 1000
  );
  const durationFormatted =
    playbackState.duration > 0
      ? formatDuration(Math.round(playbackState.duration) * 1000)
      : null;
  const isPreview = playbackState.duration > 0 && playbackState.duration < 45;

  let playButtonLabel = 'Resume playback';
  let playButtonIcon = <Play className='h-3 w-3' />;
  if (isLoading) {
    playButtonLabel = 'Loading track';
    playButtonIcon = (
      <div className='h-3 w-3 animate-pulse rounded-full bg-current' />
    );
  } else if (playbackState.isPlaying) {
    playButtonLabel = 'Pause playback';
    playButtonIcon = <Pause className='h-3 w-3' />;
  }

  const legacyBar = (className?: string) => (
    <section
      aria-label='Audio player'
      className={cn(
        'animate-in fade-in slide-in-from-bottom-2 duration-200 shrink-0 border-t border-subtle bg-(--linear-app-content-surface) backdrop-blur-xl px-3 py-2 max-lg:mb-[calc(3.5rem+env(safe-area-inset-bottom))]',
        className
      )}
    >
      <div className='flex items-center gap-3'>
        {/* Artwork */}
        {playbackState.artworkUrl && !imgError ? (
          <Image
            src={playbackState.artworkUrl}
            alt=''
            width={36}
            height={36}
            className='h-9 w-9 shrink-0 rounded-lg object-cover'
            unoptimized
            onError={() => setImgError(true)}
          />
        ) : (
          <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-1'>
            <Play className='h-3.5 w-3.5 text-tertiary-token' />
          </div>
        )}

        {/* Track info */}
        <div className='min-w-0 shrink-0 w-[120px] lg:w-[180px]'>
          <TruncatedText
            lines={1}
            className='text-[12.5px] font-caption leading-[1.2] text-primary-token'
          >
            {playbackState.trackTitle ?? ''}
          </TruncatedText>
          {(playbackState.releaseTitle || playbackState.artistName) && (
            <TruncatedText
              lines={1}
              className='text-2xs leading-[1.3] text-tertiary-token'
            >
              {[playbackState.artistName, playbackState.releaseTitle]
                .filter(Boolean)
                .join(' · ')}
            </TruncatedText>
          )}
        </div>

        {/* Seek area */}
        <div className='flex flex-1 items-center gap-2 min-w-0'>
          <span className='text-[10px] tabular-nums text-quaternary-token shrink-0 w-8 text-right'>
            {currentTimeFormatted}
          </span>
          <SeekBar
            currentTime={playbackState.currentTime}
            duration={playbackState.duration}
            onSeek={seek}
            disabled={isLoading}
            className='h-[3px] flex-1 min-w-[60px] bg-surface-1'
          />
          <span className='text-[10px] tabular-nums text-quaternary-token shrink-0 w-8'>
            {durationFormatted}
          </span>
          {isPreview ? (
            <span className='text-[9px] text-tertiary-token shrink-0'>
              Preview
            </span>
          ) : null}
        </div>

        {/* Play/pause button — 28px visible, 44px touch target via before pseudo-element */}
        <button
          type='button'
          onClick={handleToggle}
          disabled={isLoading}
          className='relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-0 text-secondary-token transition-[background-color,color,border-color] duration-150 hover:border-default hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus) disabled:opacity-50 before:absolute before:-inset-2 before:content-[""]'
          aria-label={playButtonLabel}
        >
          {playButtonIcon}
        </button>

        {/* Dismiss button — 24px visible, 44px touch target via before pseudo-element */}
        <button
          type='button'
          onClick={stop}
          className='relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-quaternary-token transition-colors duration-150 hover:text-secondary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus) before:absolute before:-inset-2.5 before:content-[""]'
          aria-label='Dismiss player'
        >
          <X className='h-3.5 w-3.5' />
        </button>
      </div>
    </section>
  );

  if (variant === 'legacy') {
    return legacyBar();
  }

  const shellTrack: AudioBarTrack = {
    id: activeTrackId,
    title: playbackState.trackTitle ?? '',
    artist: playbackState.artistName ?? '',
    hasLyrics: designV1LyricsEnabled && playbackState.hasLyrics,
  };
  const lyricsPath = buildLyricsRoute(activeTrackId);
  const nowPlayingTrack = {
    trackTitle: playbackState.trackTitle,
    artistName: playbackState.artistName,
    artworkUrl: playbackState.artworkUrl,
  };

  return (
    <>
      <div
        aria-hidden={barCollapsed}
        className='hidden shrink-0 overflow-hidden border-t border-(--linear-app-shell-border) bg-(--linear-bg-page) lg:block'
        style={{
          maxHeight: barCollapsed ? 0 : 120,
          opacity: barCollapsed ? 0 : 1,
          pointerEvents: barCollapsed ? 'none' : 'auto',
          transition: 'max-height 150ms ease-out, opacity 150ms ease-out',
        }}
      >
        <div className='px-8 pt-2'>
          <SidebarNowPlaying
            track={nowPlayingTrack}
            isPlaying={playbackState.isPlaying}
            onPlay={handleToggle}
            playOverlayVisible={false}
            className='max-w-56'
          />
        </div>
        <AudioBar
          isPlaying={playbackState.isPlaying}
          onPlay={handleToggle}
          onCollapse={() => setBarCollapsed(true)}
          currentTime={playbackState.currentTime}
          duration={playbackState.duration}
          waveformOn={waveformOn}
          onToggleWaveform={() => setWaveformOn(current => !current)}
          lyricsActive={pathname === lyricsPath}
          onOpenLyrics={
            designV1LyricsEnabled && playbackState.hasLyrics
              ? handleOpenLyrics
              : undefined
          }
          track={shellTrack}
        />
      </div>
      <div
        aria-hidden={!barCollapsed}
        className='hidden shrink-0 overflow-hidden border-t border-(--linear-app-shell-border) bg-(--linear-app-content-surface) px-3 lg:block'
        style={{
          maxHeight: barCollapsed ? 64 : 0,
          opacity: barCollapsed ? 1 : 0,
          pointerEvents: barCollapsed ? 'auto' : 'none',
          transition: 'max-height 150ms ease-out, opacity 150ms ease-out',
        }}
      >
        <SidebarBottomNowPlaying
          track={nowPlayingTrack}
          isPlaying={playbackState.isPlaying}
          onPlay={handleToggle}
          className='my-2 max-w-64'
        />
      </div>
      {legacyBar('lg:hidden')}
    </>
  );
}
