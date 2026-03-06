'use client';

import { Badge, SimpleTooltip } from '@jovie/ui';
import { memo, useMemo } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { getReleaseTypeStyle } from '@/lib/discography/release-type-styles';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { PopularityIcon } from './PopularityIcon';

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

/** Friendly display names for providers */
const PROVIDER_NAMES: Record<ProviderKey, string> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  youtube: 'YouTube',
  soundcloud: 'SoundCloud',
  deezer: 'Deezer',
  tidal: 'Tidal',
  amazon_music: 'Amazon Music',
  bandcamp: 'Bandcamp',
  beatport: 'Beatport',
  pandora: 'Pandora',
  napster: 'Napster',
  audiomack: 'Audiomack',
  qobuz: 'Qobuz',
  anghami: 'Anghami',
  boomplay: 'Boomplay',
  iheartradio: 'iHeartRadio',
  tiktok: 'TikTok',
};

const MAX_VISIBLE_ICONS = 3;

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
        name: PROVIDER_NAMES[p.key] || p.key,
      }))
      .filter(p => p.icon);

    const visible = withIcons.slice(0, MAX_VISIBLE_ICONS);
    const remaining = providers.length - visible.length;
    const allNames = providers.map(p => PROVIDER_NAMES[p.key] || p.key);

    return { visible, remaining, allNames };
  }, [release.providers]);

  return (
    <div className='flex items-center gap-3'>
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2'>
          <TruncatedText
            lines={1}
            className='text-sm font-semibold text-primary-token'
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
          <PopularityIcon popularity={release.spotifyPopularity} />
          {release.releaseDate && (
            <span className='shrink-0 text-[10px] tabular-nums text-tertiary-token sm:hidden'>
              {new Date(release.releaseDate).getFullYear()}
            </span>
          )}
          {manualOverrideCount > 0 && (
            <Badge
              variant='secondary'
              className='shrink-0 border border-warning bg-warning-subtle text-[10px] text-warning-foreground'
            >
              {manualOverrideCount} edited
            </Badge>
          )}
        </div>
        {(artistName || platformInfo) && (
          <div className='mt-0.5 flex items-center gap-2'>
            {artistName && (
              <TruncatedText lines={1} className='text-xs text-secondary-token'>
                {artistName}
              </TruncatedText>
            )}
            {platformInfo && (
              <SimpleTooltip
                content={platformInfo.allNames.join(', ')}
                side='top'
              >
                <span className='inline-flex shrink-0 items-center gap-0.5'>
                  {platformInfo.visible.map(p => (
                    <SocialIcon
                      key={p.key}
                      platform={p.icon!}
                      className='h-3 w-3 text-tertiary-token'
                      aria-hidden
                    />
                  ))}
                  {platformInfo.remaining > 0 && (
                    <span className='text-[10px] text-tertiary-token'>
                      +{platformInfo.remaining}
                    </span>
                  )}
                </span>
              </SimpleTooltip>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
