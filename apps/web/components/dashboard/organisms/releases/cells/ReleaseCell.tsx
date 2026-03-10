'use client';

import { Badge } from '@jovie/ui';
import { Pause, Play } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { getReleaseTypeStyle } from '@/lib/discography/release-type-styles';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';

/** Maps ProviderKey to SocialIcon platform name (only those with SVG icons) */
const PROVIDER_ICON_MAP: Partial<Record<ProviderKey, string>> = {
  spotify: 'spotify',
  apple_music: 'apple_music',
  youtube: 'youtube',
  soundcloud: 'soundcloud',
  tidal: 'tidal',
  bandcamp: 'bandcamp',
  beatport: 'beatport',
  tiktok: 'tiktok',
};

const MAX_VISIBLE_ICONS = 3;

interface IconProviderInfo {
  readonly key: ProviderKey;
  readonly icon: string;
}

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

  const platformInfo = useMemo(() => {
    const providers = release.providers;
    if (providers.length === 0) return null;

    const withIcons = providers
      .map(p => ({
        key: p.key,
        icon: PROVIDER_ICON_MAP[p.key],
      }))
      .filter((p): p is IconProviderInfo => Boolean(p.icon));

    const visible = withIcons.slice(0, MAX_VISIBLE_ICONS);
    const remaining = withIcons.length - visible.length;
    return { visible, remaining };
  }, [release.providers]);

  return (
    <div className='grid min-w-0 items-center gap-x-3 grid-cols-[24px_minmax(0,1fr)_minmax(88px,120px)_auto_minmax(0,72px)]'>
      <div className='flex w-6 items-center justify-center'>
        {hasPreview ? (
          <button
            type='button'
            onClick={handleTogglePlayback}
            className='flex h-6 w-6 items-center justify-center rounded-full text-primary-token transition-colors hover:bg-white/[0.06]'
            aria-label={
              isPlaying ? `Pause ${release.title}` : `Play ${release.title}`
            }
          >
            {isPlaying ? (
              <Pause className='h-3 w-3' />
            ) : (
              <Play className='h-3 w-3' />
            )}
          </button>
        ) : (
          <span className='h-6 w-6' />
        )}
      </div>

      <div className='flex min-w-0 items-center gap-1.5'>
        <TruncatedText
          lines={1}
          className='text-[13px] font-[510] tracking-[-0.011em] text-(--linear-text-primary)'
          tooltipSide='top'
          tooltipAlign='start'
        >
          {release.title}
        </TruncatedText>
        {showType && typeStyle && (
          <Badge
            size='sm'
            className={`shrink-0 ${typeStyle.border} ${typeStyle.bg} ${typeStyle.text}`}
          >
            {typeStyle.label}
          </Badge>
        )}
        {manualOverrideCount > 0 && (
          <Badge
            variant='secondary'
            className='shrink-0 border-amber-500/15 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300'
          >
            {manualOverrideCount} edited
          </Badge>
        )}
      </div>

      <div className='min-w-0'>
        {artistName ? (
          <TruncatedText
            lines={1}
            className='text-[12px] font-[450] tracking-[-0.01em] text-(--linear-text-secondary)'
          >
            {artistName}
          </TruncatedText>
        ) : null}
      </div>

      <div className='flex min-w-0 items-center justify-start'>
        {platformInfo ? (
          <div className='inline-flex h-6 shrink-0 items-center gap-1 text-[11px] text-(--linear-text-tertiary)'>
            <span className='flex items-center gap-0.5'>
              {platformInfo.visible.map(p => (
                <SocialIcon
                  key={p.key}
                  platform={p.icon}
                  className='h-3.5 w-3.5 text-(--linear-text-secondary)'
                  aria-hidden
                />
              ))}
            </span>
            {platformInfo.remaining > 0 && (
              <span className='tabular-nums text-[10px] text-(--linear-text-tertiary)'>
                +{platformInfo.remaining}
              </span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
});
