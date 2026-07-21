'use client';

import { Activity, Pause, Play } from 'lucide-react';
import type { ReactNode } from 'react';
import { DSP_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import { Icon } from '@/components/atoms/Icon';
import {
  DrawerAsyncToggle,
  DrawerFormGridRow,
  DrawerMediaThumb,
  DrawerSection,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import { DrawerHero } from '@/components/shell/DrawerHero';
import { DropDateChip } from '@/components/shell/DropDateChip';
import {
  type DspAvatarItem,
  DspAvatarStack,
  type DspStatus,
} from '@/components/shell/DspAvatarStack';
import { MetaPill } from '@/components/shell/MetaPill';
import {
  type ReleaseStatus,
  StatusBadge,
} from '@/components/shell/StatusBadge';
import { TypeBadge } from '@/components/shell/TypeBadge';
import {
  AlbumArtworkContextMenu,
  buildArtworkSizes,
} from '@/features/release/AlbumArtworkContextMenu';
import type { ProviderConfidence, ProviderKey } from '@/lib/discography/types';
import { dropDateMeta } from '@/lib/format-drop-date';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/utils/date-formatting';
import type { Release } from './types';
import { isValidUrl } from './utils';

const RELEASE_SIDEBAR_CARD_CLASSNAME = 'overflow-hidden';

const RELEASE_TYPE_LABELS: Record<string, string> = {
  single: 'Single',
  ep: 'EP',
  album: 'Album',
  compilation: 'Compilation',
  live: 'Live',
  mixtape: 'Mixtape',
  music_video: 'Music Video',
  other: 'Other',
};

const DEFAULT_DSP_COLOR = 'var(--color-text-quaternary-token)';

function getPreviewAriaLabel(hasPreview: boolean, isPlaying: boolean): string {
  if (!hasPreview) return 'No preview available';
  return isPlaying ? 'Pause preview' : 'Play preview';
}

interface ReleaseEntityHeaderProps {
  readonly release: Release;
  readonly artistName: string | null | undefined;
  readonly providerConfig: Record<
    ProviderKey,
    { label: string; accent: string }
  >;
  readonly onArtistClick?: (artistName: string) => void;
  readonly canUploadArtwork: boolean;
  readonly canRevertArtwork: boolean;
  readonly onArtworkUpload: ((file: File) => Promise<string>) | undefined;
  readonly onArtworkRevert: (() => void) | undefined;
  readonly allowDownloads: boolean;
  readonly previewUrl: string | null | undefined;
  readonly isPlaying: boolean;
  readonly onTogglePreview: () => void;
  readonly actionBar?: ReactNode;
  readonly footer?: ReactNode;
}

const releaseArtistListFormatter = new Intl.ListFormat('en', {
  style: 'long',
  type: 'conjunction',
});

function renderArtistLine(
  artistNames: string[] | undefined,
  fallbackArtistName: string | null | undefined,
  onArtistClick: ((artistName: string) => void) | undefined
): ReactNode {
  const normalizedNames = (artistNames ?? [])
    .map(name => name.trim())
    .filter(Boolean);

  if (normalizedNames.length === 0) {
    const fallback = fallbackArtistName?.trim();
    if (!fallback) return null;
    if (!onArtistClick) return fallback;
    return (
      <button
        type='button'
        onClick={() => onArtistClick(fallback)}
        className='rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-bg-page)'
      >
        {fallback}
      </button>
    );
  }

  if (!onArtistClick) {
    return releaseArtistListFormatter.format(normalizedNames);
  }

  const partKeyCounts = new Map<string, number>();

  return releaseArtistListFormatter.formatToParts(normalizedNames).map(part => {
    const keyBase = `${part.type}:${part.value}`;
    const occurrence = (partKeyCounts.get(keyBase) ?? 0) + 1;
    partKeyCounts.set(keyBase, occurrence);
    const key = `${keyBase}:${occurrence}`;

    return part.type === 'element' ? (
      <button
        key={key}
        type='button'
        onClick={() => onArtistClick(part.value)}
        className='rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-bg-page)'
      >
        {part.value}
      </button>
    ) : (
      <span key={key}>{part.value}</span>
    );
  });
}

function getReleaseTypeLabel(releaseType: string | undefined): string | null {
  if (!releaseType) return null;
  return RELEASE_TYPE_LABELS[releaseType] ?? releaseType;
}

function getShellReleaseStatus(release: Release): ReleaseStatus {
  if (release.deletedAt) return 'hidden';
  if (release.status === 'scheduled') return 'scheduled';
  if (release.status === 'draft') return 'draft';
  return 'live';
}

function getDspStatus({
  url,
  confidence,
}: {
  readonly url: string;
  readonly confidence?: ProviderConfidence;
}): DspStatus {
  if (!url || !isValidUrl(url)) return 'error';

  if (confidence === 'search_fallback' || confidence === 'unknown') {
    return 'pending';
  }

  return 'live';
}

function getProviderGlyph(label: string, fallback: string): string {
  return (label.match(/[a-z0-9]/iu)?.[0] ?? fallback[0] ?? '?').toUpperCase();
}

function getDspAvatarItems(
  release: Release,
  providerConfig: Record<ProviderKey, { label: string; accent: string }>
): DspAvatarItem[] {
  const linkedItems = release.providers.map(provider => {
    const label = providerConfig[provider.key]?.label || provider.label;
    return {
      id: provider.key,
      status: getDspStatus({
        url: provider.url,
        confidence: provider.confidence,
      }),
      label,
      glyph: getProviderGlyph(label, provider.key),
      iconPath: DSP_LOGO_CONFIG[provider.key]?.iconPath,
      color: providerConfig[provider.key]?.accent ?? DEFAULT_DSP_COLOR,
    };
  });

  const missingItems = (release.providerCounts?.unresolvedProviders ?? [])
    .filter(key => !release.providers.some(provider => provider.key === key))
    .map(key => {
      const label = providerConfig[key]?.label || key;
      return {
        id: key,
        status: 'missing' as const,
        label,
        glyph: getProviderGlyph(label, key),
        iconPath: DSP_LOGO_CONFIG[key]?.iconPath,
        color: providerConfig[key]?.accent ?? DEFAULT_DSP_COLOR,
      };
    });

  return [...linkedItems, ...missingItems];
}

function formatTrackCount(totalTracks: number): string | null {
  if (totalTracks <= 0) return null;
  return `${totalTracks} ${totalTracks === 1 ? 'Track' : 'Tracks'}`;
}

export function ReleaseEntityHeader({
  release,
  artistName,
  providerConfig,
  onArtistClick,
  canUploadArtwork,
  canRevertArtwork,
  onArtworkUpload,
  onArtworkRevert,
  allowDownloads,
  previewUrl,
  isPlaying,
  onTogglePreview,
  actionBar,
  footer,
}: ReleaseEntityHeaderProps) {
  const artworkAlt = release.title
    ? `${release.title} artwork`
    : 'Release artwork';
  const artistLine = renderArtistLine(
    release.artistNames,
    artistName,
    onArtistClick
  );
  const hasActionBar = Boolean(actionBar);
  const releaseTypeLabel = getReleaseTypeLabel(release.releaseType);
  const releaseDate = release.releaseDate
    ? dropDateMeta(release.releaseDate)
    : null;
  const dspItems = getDspAvatarItems(release, providerConfig);
  const trackLabel = formatTrackCount(release.totalTracks);

  return (
    <DrawerSurfaceCard
      variant='card'
      className={RELEASE_SIDEBAR_CARD_CLASSNAME}
      testId='release-header-card'
    >
      <div className='relative'>
        {hasActionBar ? (
          <div className='absolute right-2.5 top-2.5'>{actionBar}</div>
        ) : null}
        <DrawerHero
          title={release.title}
          stableLayout
          titleLineClamp={2}
          subtitleLineClamp={2}
          reserveSubtitleSlot
          reserveMetaSlot
          metaOverflow='scroll'
          subtitle={
            artistLine ? (
              <span className='line-clamp-2 block'>{artistLine}</span>
            ) : null
          }
          artwork={
            <div className='group/artwork relative shrink-0'>
              <AlbumArtworkContextMenu
                title={release.title}
                sizes={buildArtworkSizes(undefined, release.artworkUrl)}
                allowDownloads={allowDownloads}
                releaseId={release.id}
                canRevert={canRevertArtwork}
                onRevert={canRevertArtwork ? onArtworkRevert : undefined}
              >
                {canUploadArtwork && onArtworkUpload ? (
                  <AvatarUploadable
                    src={release.artworkUrl}
                    alt={artworkAlt}
                    name={release.title}
                    size='2xl'
                    rounded='md'
                    uploadable={canUploadArtwork}
                    onUpload={onArtworkUpload}
                    showHoverOverlay
                  />
                ) : (
                  <DrawerMediaThumb
                    src={release.artworkUrl}
                    alt={artworkAlt}
                    sizeClassName='h-17 w-17 rounded-xl'
                    sizes='68px'
                    fallback={
                      <Icon
                        name='Disc3'
                        className='h-10 w-10 text-tertiary-token'
                        aria-hidden='true'
                      />
                    }
                  />
                )}
              </AlbumArtworkContextMenu>

              <button
                type='button'
                onClick={onTogglePreview}
                disabled={!previewUrl}
                aria-pressed={isPlaying}
                className={cn(
                  'absolute inset-0 flex items-center justify-center rounded-xl transition-[background-color,opacity] duration-subtle',
                  'bg-black/0 opacity-0',
                  'group-hover/artwork:bg-black/40 group-hover/artwork:opacity-100',
                  'aria-[pressed=true]:bg-black/40 aria-[pressed=true]:opacity-100',
                  'disabled:pointer-events-none disabled:hidden'
                )}
                aria-label={getPreviewAriaLabel(Boolean(previewUrl), isPlaying)}
              >
                {isPlaying ? (
                  <Pause className='h-5 w-5 text-white dark:text-white drop-shadow-sm' />
                ) : (
                  <Play className='h-5 w-5 translate-x-px text-white dark:text-white drop-shadow-sm' />
                )}
              </button>
            </div>
          }
          meta={
            <>
              <StatusBadge status={getShellReleaseStatus(release)} />
              {releaseTypeLabel ? <TypeBadge label={releaseTypeLabel} /> : null}
              {releaseDate ? (
                <DropDateChip
                  tone={releaseDate.tone}
                  label={releaseDate.label}
                />
              ) : null}
              {trackLabel ? <MetaPill>{trackLabel}</MetaPill> : null}
              <DspAvatarStack dsps={dspItems} />
            </>
          }
          className={cn('pb-2.5', hasActionBar && '[&_h2]:pr-9')}
        />
      </div>
      {footer ? (
        <div className='border-t border-(--app-shell-frame-seam) px-3 py-2.5'>
          {footer}
        </div>
      ) : null}
    </DrawerSurfaceCard>
  );
}

/**
 * Default handler for the artwork-downloads toggle when the consumer does not
 * supply its own. Routes through the thin POST /api/dashboard/releases/artwork-
 * downloads endpoint instead of importing the server action directly, so this
 * shared organism stays free of server-only imports (server-imports ratchet).
 * Throws on failure so DrawerAsyncToggle reverts and shows its error toast.
 */
async function defaultToggleArtworkDownloads(value: boolean): Promise<void> {
  const response = await fetch('/api/dashboard/releases/artwork-downloads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ allowDownloads: value }),
  });

  if (!response.ok) {
    throw new Error('Failed to update artwork downloads setting');
  }
}

export function ReleaseArtworkDownloadsSetting({
  allowDownloads,
  onToggleArtworkDownloads,
}: {
  readonly allowDownloads: boolean;
  readonly onToggleArtworkDownloads:
    | ((value: boolean) => Promise<void>)
    | undefined;
}) {
  return (
    <DrawerFormGridRow label='Artwork' className='items-start'>
      <DrawerAsyncToggle
        label='Allow Downloads'
        ariaLabel='Allow artwork downloads on public pages'
        checked={allowDownloads}
        onToggle={onToggleArtworkDownloads ?? defaultToggleArtworkDownloads}
        successMessage={on =>
          on
            ? 'Artwork downloads enabled for visitors'
            : 'Artwork downloads disabled'
        }
        density='compact'
      />
    </DrawerFormGridRow>
  );
}

export function ReleaseActivitySection({
  release,
  providerConfig,
}: {
  readonly release: Release;
  readonly providerConfig: Record<
    ProviderKey,
    { label: string; accent: string }
  >;
}) {
  const activityRows = release.providers
    .map(provider => {
      if (!provider.updatedAt) return null;
      const label = providerConfig[provider.key]?.label || provider.label;
      return {
        providerKey: provider.key,
        label,
        updatedAt: provider.updatedAt,
        timestamp: new Date(provider.updatedAt).getTime(),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .filter(row => Number.isFinite(row.timestamp))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 3);

  if (activityRows.length === 0) {
    return null;
  }

  return (
    <DrawerSection
      title='Activity'
      surface='plain'
      collapsible={false}
      testId='release-activity-card'
      contentClassName='p-0'
    >
      <div className='divide-y divide-(--app-shell-frame-seam)'>
        {activityRows.map(row => (
          <div
            key={`${row.providerKey}-${row.updatedAt}`}
            className='flex items-center gap-2.5 px-3 py-2.5'
          >
            <span className='flex size-6 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-1 text-tertiary-token'>
              <Activity className='size-3' aria-hidden='true' />
            </span>
            <div className='min-w-0 flex-1'>
              <p className='truncate text-xs font-caption text-primary-token'>
                {row.label} Link updated
              </p>
              <p className='mt-0.5 text-3xs text-tertiary-token'>
                {formatTimeAgo(row.updatedAt)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </DrawerSection>
  );
}
