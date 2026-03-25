'use client';

import { Badge } from '@jovie/ui';
import { Pause, Play, VolumeX } from 'lucide-react';
import { memo, useCallback } from 'react';
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

  const handleTogglePlayback = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!release.previewUrl) return;
      toggleTrack({
        id: release.id,
        title: release.title,
        audioUrl: release.previewUrl,
        releaseTitle: release.title,
        artistName: release.artistNames?.[0],
        artworkUrl: release.artworkUrl,
      }).catch(() => {});
    },
    [
      toggleTrack,
      release.id,
      release.title,
      release.previewUrl,
      release.artistNames,
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
    <div className='grid min-w-0 grid-cols-[16px_minmax(0,1fr)] items-start gap-x-2.5'>
      <div className='flex w-[16px] items-center justify-center pt-0.5'>
        {hasPreview ? (
          <DrawerInlineIconButton
            onClick={handleTogglePlayback}
            className='h-[16px] w-[16px] rounded-[4px] p-0 text-quaternary-token opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100 aria-[pressed=true]:opacity-100'
            aria-label={
              isPlaying ? `Pause ${release.title}` : `Play ${release.title}`
            }
            aria-pressed={isPlaying}
          >
            {isPlaying ? (
              <Pause className='h-[8px] w-[8px]' />
            ) : (
              <Play className='h-[8px] w-[8px]' />
            )}
          </DrawerInlineIconButton>
        ) : (
          <VolumeX
            className='h-[9px] w-[9px] text-quaternary-token/40'
            aria-label='No preview available'
          />
        )}
      </div>

      <div className='min-w-0 space-y-px'>
        <div className='flex min-w-0 items-center gap-1.5 leading-none'>
          <TruncatedText
            lines={1}
            className='min-w-0 flex-1 text-[12.5px] font-[510] leading-[1.1] tracking-[-0.012em] text-primary-token'
            tooltipSide='top'
            tooltipAlign='start'
          >
            {release.title}
          </TruncatedText>
          {showType && typeStyle && (
            <Badge
              size='sm'
              className={`inline-flex h-[16px] shrink-0 items-center justify-center rounded-[6px] px-1.5 py-0 align-middle text-[9px] font-[510] leading-none tracking-normal ${typeStyle.bg} ${typeStyle.text}`}
            >
              {typeStyle.label}
            </Badge>
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
            className='text-[11px] font-[400] leading-[1.2] tracking-[-0.005em] text-tertiary-token'
          >
            {artistLine}
          </TruncatedText>
        ) : null}
      </div>
    </div>
  );
});
