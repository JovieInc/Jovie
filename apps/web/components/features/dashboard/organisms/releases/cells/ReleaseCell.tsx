'use client';

import { Badge } from '@jovie/ui';
import { Pause, Play } from 'lucide-react';
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
      }).catch(() => {});
    },
    [toggleTrack, release.id, release.title, release.previewUrl]
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
    <div className='grid min-w-0 grid-cols-[18px_minmax(0,1fr)] items-start gap-x-2'>
      <div className='flex w-[16px] items-center justify-center pt-0.5'>
        {hasPreview ? (
          <DrawerInlineIconButton
            onClick={handleTogglePlayback}
            className='h-4 w-4 rounded-[4px] p-0 text-tertiary-token'
            aria-label={
              isPlaying ? `Pause ${release.title}` : `Play ${release.title}`
            }
            aria-pressed={isPlaying}
          >
            {isPlaying ? (
              <Pause className='h-[9px] w-[9px]' />
            ) : (
              <Play className='h-[9px] w-[9px]' />
            )}
          </DrawerInlineIconButton>
        ) : (
          <span className='h-4 w-4' />
        )}
      </div>

      <div className='min-w-0 space-y-0.5'>
        <div className='flex min-w-0 items-center gap-1 leading-none'>
          <TruncatedText
            lines={1}
            className='min-w-0 flex-1 text-[14px] font-[510] leading-[1.15] tracking-[-0.013em] text-primary-token'
            tooltipSide='top'
            tooltipAlign='start'
          >
            {release.title}
          </TruncatedText>
          {showType && typeStyle && (
            <Badge
              size='sm'
              className={`h-[17px] shrink-0 rounded-[5px] border px-1.5 text-[9px] font-[510] tracking-[-0.01em] shadow-none ${typeStyle.border} ${typeStyle.bg} ${typeStyle.text}`}
            >
              {typeStyle.label}
            </Badge>
          )}
          {manualOverrideCount > 0 && (
            <Badge
              variant='secondary'
              className='hidden h-[17px] shrink-0 rounded-[5px] border border-amber-500/15 bg-amber-500/10 px-1.5 text-[9px] font-[510] tracking-[-0.01em] text-amber-700 shadow-none xl:inline-flex dark:text-amber-300'
            >
              {manualOverrideCount} edited
            </Badge>
          )}
        </div>
        {artistLine ? (
          <TruncatedText
            lines={1}
            className='text-[12.5px] font-[400] leading-[1.3] tracking-[-0.01em] text-secondary-token'
          >
            {artistLine}
          </TruncatedText>
        ) : null}
      </div>
    </div>
  );
});
