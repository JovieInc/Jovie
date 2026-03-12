'use client';

import { Badge } from '@jovie/ui';
import { Pause, Play } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { getReleaseTypeStyle } from '@/lib/discography/release-type-styles';
import type { ReleaseViewModel } from '@/lib/discography/types';

const artistListFormatter = new Intl.ListFormat('en', {
  style: 'long',
  type: 'conjunction',
});

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

  const artistLine = useMemo(() => {
    const artistNames = (release.artistNames ?? [])
      .map(name => name.trim())
      .filter(Boolean);

    if (artistNames.length > 0) {
      return artistListFormatter.format(artistNames);
    }

    return artistName?.trim() || null;
  }, [artistName, release.artistNames]);

  return (
    <div className='grid min-w-0 grid-cols-[20px_minmax(0,1fr)] items-start gap-x-2.5'>
      <div className='flex w-[20px] items-center justify-center pt-0.5'>
        {hasPreview ? (
          <button
            type='button'
            onClick={handleTogglePlayback}
            className='flex h-5 w-5 items-center justify-center rounded-[6px] border border-transparent text-(--linear-text-tertiary) transition-[background-color,border-color,color] duration-150 hover:border-(--linear-border-subtle) hover:bg-(--linear-bg-surface-1) hover:text-(--linear-text-primary) focus-visible:border-(--linear-border-focus) focus-visible:bg-(--linear-bg-surface-1) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
            aria-label={
              isPlaying ? `Pause ${release.title}` : `Play ${release.title}`
            }
          >
            {isPlaying ? (
              <Pause className='h-[11px] w-[11px]' />
            ) : (
              <Play className='h-[11px] w-[11px]' />
            )}
          </button>
        ) : (
          <span className='h-5 w-5' />
        )}
      </div>

      <div className='min-w-0 space-y-px'>
        <div className='flex min-w-0 items-center gap-1 leading-none'>
          <TruncatedText
            lines={1}
            className='text-[13px] font-[510] leading-[1.15] tracking-[-0.013em] text-(--linear-text-primary)'
            tooltipSide='top'
            tooltipAlign='start'
          >
            {release.title}
          </TruncatedText>
          {showType && typeStyle && (
            <Badge
              size='sm'
              className={`h-4 shrink-0 rounded-[5px] border px-1.5 text-[9px] font-[510] tracking-[-0.01em] shadow-none ${typeStyle.border} ${typeStyle.bg} ${typeStyle.text}`}
            >
              {typeStyle.label}
            </Badge>
          )}
          {manualOverrideCount > 0 && (
            <Badge
              variant='secondary'
              className='h-4 shrink-0 rounded-[5px] border border-amber-500/15 bg-amber-500/10 px-1.5 text-[9px] font-[510] tracking-[-0.01em] text-amber-700 shadow-none dark:text-amber-300'
            >
              {manualOverrideCount} edited
            </Badge>
          )}
        </div>
        {artistLine ? (
          <TruncatedText
            lines={1}
            className='text-[12px] font-[450] leading-[1.2] tracking-[-0.01em] text-(--linear-text-secondary)'
          >
            {artistLine}
          </TruncatedText>
        ) : null}
      </div>
    </div>
  );
});
