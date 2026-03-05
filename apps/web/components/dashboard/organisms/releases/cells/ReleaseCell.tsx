'use client';

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { memo } from 'react';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { getReleaseTypeStyle } from '@/lib/discography/release-type-styles';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { PopularityIcon } from './PopularityIcon';


const MAX_VISIBLE_ICONS = 3;

const PROVIDER_KEY_TO_ICON: Record<string, string> = {
  spotify: 'spotify',
  apple_music: 'apple_music',
  youtube: 'youtube',
  soundcloud: 'soundcloud',
  deezer: 'deezer',
  tidal: 'tidal',
  amazon_music: 'amazon_music',
  bandcamp: 'bandcamp',
  beatport: 'beatport',
  pandora: 'pandora',
  napster: 'napster',
  audiomack: 'audiomack',
  qobuz: 'qobuz',
  anghami: 'anghami',
  boomplay: 'boomplay',
  iheartradio: 'iheartradio',
  tiktok: 'tiktok',
  youtube_music: 'youtube_music',
};

function PlatformIcons({ providers }: { readonly providers: ReleaseViewModel['providers'] }) {
  if (providers.length === 0) return null;

  const visible = providers.slice(0, MAX_VISIBLE_ICONS);
  const remaining = providers.length - MAX_VISIBLE_ICONS;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className='inline-flex items-center gap-0.5 shrink-0'>
          {visible.map(p => (
            <SocialIcon
              key={p.key}
              platform={PROVIDER_KEY_TO_ICON[p.key] ?? p.key}
              className='h-3 w-3 text-tertiary-token'
              aria-hidden
            />
          ))}
          {remaining > 0 && (
            <span className='text-[10px] text-tertiary-token'>
              +{remaining}
            </span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side='top' className='max-w-[200px]'>
        <div className='flex flex-col gap-1'>
          {providers.map(p => (
            <span key={p.key} className='flex items-center gap-1.5 text-xs'>
              <SocialIcon
                platform={PROVIDER_KEY_TO_ICON[p.key] ?? p.key}
                className='h-3 w-3'
                aria-hidden
              />
              {p.label}
            </span>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

interface ReleaseCellProps {
  readonly release: ReleaseViewModel;
  readonly artistName?: string | null;
  /** Whether to show release type inline (when type column is hidden) */
  readonly showType?: boolean;
}

/**
 * ReleaseCell - Displays release title and artist name
 *
 * Shows:
 * - Release title with tooltip (only when truncated)
 * - Release type badge (Single, EP, Album, etc.)
 * - Popularity signal-bars icon
 * - Optional "edited" badge if manual overrides exist
 * - Artist name if provided
 */
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

  return (
    <div className='flex items-center gap-3'>
      {/* Title and metadata */}
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
          {/* Year - mobile only (meta column is hidden on mobile) */}
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
          <PlatformIcons providers={release.providers} />
        </div>
        {artistName && (
          <TruncatedText
            lines={1}
            className='mt-0.5 text-xs text-secondary-token'
          >
            {artistName}
          </TruncatedText>
        )}
      </div>
    </div>
  );
});
