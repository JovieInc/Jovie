'use client';

import { Pause, Play, VolumeX } from 'lucide-react';
import { memo, useCallback } from 'react';
import { toast } from 'sonner';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { DrawerInlineIconButton } from '@/components/molecules/drawer';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { formatCompactReleaseArtistLine } from '@/lib/discography/formatting';
import { getReleaseTypeStyle } from '@/lib/discography/release-type-styles';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { cn } from '@/lib/utils';

interface ReleaseCellProps {
  readonly release: ReleaseViewModel;
  readonly artistName?: string | null;
  readonly showType?: boolean;
}

export const ReleaseCell = memo(function ReleaseCell({
  release,
  artistName,
  showType = true,
}: ReleaseCellProps) {
  const { playbackState, toggleTrack } = useTrackAudioPlayer();
  const isActiveTrack = playbackState.activeTrackId === release.id;
  const isPlaying = isActiveTrack && playbackState.isPlaying;
  const hasPreview = Boolean(release.previewUrl);
  const primaryArtist = release.artistNames?.[0];

  const handleTogglePlayback = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!release.previewUrl) return;
      toggleTrack({
        id: release.id,
        title: release.title,
        audioUrl: release.previewUrl,
        releaseTitle: release.title,
        artistName: primaryArtist,
        artworkUrl: release.artworkUrl,
      }).catch(() => {
        toast.error('Unable to play preview');
      });
    },
    [
      toggleTrack,
      release.id,
      release.title,
      release.previewUrl,
      primaryArtist,
      release.artworkUrl,
    ]
  );

  const typeStyle = release.releaseType
    ? getReleaseTypeStyle(release.releaseType)
    : null;

  const artistLine = formatCompactReleaseArtistLine(
    release.artistNames,
    artistName
  );

  return (
    <div className='flex min-w-0 items-center gap-2.5'>
      {/* Play/status indicator — 16px column */}
      <div className='flex w-4 shrink-0 items-center justify-center'>
        {hasPreview ? (
          <DrawerInlineIconButton
            onClick={handleTogglePlayback}
            className={cn(
              'h-4 w-4 rounded-[3px] p-0 transition-opacity duration-150 focus-visible:opacity-100',
              isPlaying
                ? 'text-(--linear-accent) opacity-100'
                : 'text-quaternary-token opacity-0 group-hover:opacity-100 aria-[pressed=true]:opacity-100'
            )}
            aria-label={
              isPlaying ? `Pause ${release.title}` : `Play ${release.title}`
            }
            aria-pressed={isPlaying}
          >
            {isPlaying ? (
              <Pause className='h-2.5 w-2.5' />
            ) : (
              <Play className='h-2.5 w-2.5' />
            )}
          </DrawerInlineIconButton>
        ) : showType && typeStyle ? (
          <span
            className={cn('h-2 w-2 shrink-0 rounded-full', typeStyle.dot)}
            title={typeStyle.label}
          />
        ) : (
          <VolumeX
            className='h-3 w-3 text-quaternary-token'
            aria-label='No preview available'
          />
        )}
      </div>

      {/* Title + artist */}
      <div className='min-w-0 flex-1'>
        <div className='flex min-w-0 items-center gap-1.5 leading-none'>
          <TruncatedText
            lines={1}
            className='min-w-0 flex-1 text-[13px] font-[510] leading-[1.15] tracking-[-0.012em] text-primary-token'
            tooltipSide='top'
            tooltipAlign='start'
          >
            {release.title}
          </TruncatedText>
          {showType && typeStyle && hasPreview && (
            <span
              className={cn(
                'shrink-0 text-[10px] font-[510] leading-none tracking-normal',
                typeStyle.text
              )}
            >
              {typeStyle.label}
            </span>
          )}
        </div>
        {artistLine ? (
          <TruncatedText
            lines={1}
            className='mt-px text-[11px] font-[400] leading-[1.2] tracking-[-0.005em] text-secondary-token'
          >
            {artistLine}
          </TruncatedText>
        ) : null}
      </div>
    </div>
  );
});
