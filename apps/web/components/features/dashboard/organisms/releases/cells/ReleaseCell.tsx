'use client';

import { Badge } from '@jovie/ui';
import { Pause, Play, VolumeX } from 'lucide-react';
import { memo, useCallback } from 'react';
import { toast } from 'sonner';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { DrawerInlineIconButton } from '@/components/molecules/drawer';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { formatCompactReleaseArtistLine } from '@/lib/discography/formatting';
import { getReleaseTypeStyle } from '@/lib/discography/release-type-styles';
import type { ReleaseViewModel } from '@/lib/discography/types';

interface ReleaseCellProps {
  readonly release: ReleaseViewModel;
  readonly artistName?: string | null;
  /** Whether to show release type inline (when type column is hidden) */
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

  const manualOverrideCount = release.providers.filter(
    provider => provider.source === 'manual'
  ).length;

  const typeStyle = release.releaseType
    ? getReleaseTypeStyle(release.releaseType)
    : null;

  const artistLine = formatCompactReleaseArtistLine(
    release.artistNames,
    artistName
  );

  return (
    <div className='grid min-w-0 grid-cols-[16px_minmax(0,1fr)] items-center gap-x-2.5'>
      <div className='flex w-[16px] items-center justify-center'>
        {hasPreview ? (
          <DrawerInlineIconButton
            onClick={handleTogglePlayback}
            className={`h-[16px] w-[16px] rounded-[4px] p-0 transition-opacity duration-150 focus-visible:opacity-100 ${
              isPlaying
                ? 'text-(--linear-accent) opacity-100'
                : 'text-quaternary-token opacity-40 group-hover:opacity-100 aria-[pressed=true]:opacity-100'
            }`}
            aria-label={
              isPlaying ? `Pause ${release.title}` : `Play ${release.title}`
            }
            aria-pressed={isPlaying}
          >
            {isPlaying ? (
              <Pause className='h-[10px] w-[10px]' />
            ) : (
              <Play className='h-[10px] w-[10px]' />
            )}
          </DrawerInlineIconButton>
        ) : (
          <span className='flex h-[16px] w-[16px] items-center justify-center rounded-[4px] bg-surface-1 text-secondary-token/80'>
            <VolumeX
              className='h-[11px] w-[11px]'
              aria-label='No preview available'
            />
          </span>
        )}
      </div>

      <div className='min-w-0 space-y-px'>
        <div className='flex min-w-0 items-center gap-1.5 leading-none'>
          <TruncatedText
            lines={1}
            className='min-w-0 flex-1 text-[13px] font-[510] leading-[1.1] tracking-[-0.012em] text-primary-token'
            tooltipSide='top'
            tooltipAlign='start'
          >
            {release.title}
          </TruncatedText>
          {showType && typeStyle && (
            <span
              className={`shrink-0 text-[10.5px] font-[510] leading-none tracking-normal ${typeStyle.text}`}
            >
              {typeStyle.label}
            </span>
          )}
          {manualOverrideCount > 0 && (
            <Badge
              variant='secondary'
              className='hidden h-[16px] shrink-0 items-center justify-center rounded-[6px] bg-amber-500/10 px-1.5 py-0 text-[9px] font-[510] leading-none tracking-normal text-amber-700 xl:inline-flex dark:text-amber-300'
            >
              {manualOverrideCount} edited
            </Badge>
          )}
        </div>
        {artistLine ? (
          <TruncatedText
            lines={1}
            className='text-[11.5px] font-[400] leading-[1.2] tracking-[-0.005em] text-secondary-token'
          >
            {artistLine}
          </TruncatedText>
        ) : null}
      </div>
    </div>
  );
});
